#!/usr/bin/env node
/**
 * check-install.mjs — 装之前先自检：这个插件在**你的** DSH 里到底会不会被加载。
 *
 *   node tools/check-install.mjs                      # 检查本插件 vs $DSH_HOME/profiles/web
 *   node tools/check-install.mjs --profile <dir>      # 指定别的 profile（如 ~/.dsh/profiles/desktop）
 *   node tools/check-install.mjs --plugin <dir>       # 检查别的插件
 *   node tools/check-install.mjs --plugin-only        # 只查包自洽，不看 profile（CI 用）
 *   node tools/check-install.mjs --json               # 机器可读，给 CI / 脚本用
 *
 * 它检查两件事：
 *   A. 插件包自己是否自洽（manifest、入口、cordis.patch.yml、peer 依赖）
 *   B. profile 是否真的把它登记了（dependencies + dsh.profile.bundles + 路径能不能解析到本包）
 *
 * 退出码：0 全绿 / 1 有 ❌ / 2 用法或环境错误。只读，不修改任何文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parsePatchYaml, composeEntries } from './patch-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLUGIN = path.resolve(HERE, '..');
const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// 只有直接运行时才解析命令行参数；被 install.mjs import 时保持默认值，别吞掉它的参数。
const argv = isMain ? process.argv.slice(2) : [];
const opt = { profile: null, plugin: DEFAULT_PLUGIN, json: false, pluginOnly: false };
if (isMain) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') opt.profile = argv[++i];
    else if (a === '--plugin') opt.plugin = path.resolve(argv[++i]);
    else if (a === '--json') opt.json = true;
    else if (a === '--plugin-only') opt.pluginOnly = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^\s*\* ?/gm, '')); process.exit(0); }
    else { console.error(`未知参数：${a}（--help 看用法）`); process.exit(2); }
  }
}

// ── 小工具 ──────────────────────────────────────────────────────────────
const results = [];   // { level: 'ok'|'bad'|'warn', area, title, detail, fix }
const ok = (area, title, detail = '') => results.push({ level: 'ok', area, title, detail });
const bad = (area, title, detail = '', fix = '') => results.push({ level: 'bad', area, title, detail, fix });
const warn = (area, title, detail = '', fix = '') => results.push({ level: 'warn', area, title, detail, fix });
const resetResults = () => { results.length = 0; };
const printResults = (into = console.log) => {
  let area = '';
  for (const r of results) {
    if (r.area !== area) { area = r.area; into(area === 'plugin' ? '\n── 插件包自身 ──' : '\n── profile 登记 ──'); }
    const mark = r.level === 'ok' ? '✓' : r.level === 'warn' ? '~' : '✗';
    into(`  ${mark} ${r.title}${r.detail ? '  ' + r.detail : ''}`);
    if (r.fix && r.level !== 'ok') into(`     → ${r.fix}`);
  }
};

const readJson = (p) => {
  const txt = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');   // 容忍 BOM（Windows 上常见）
  try { return JSON.parse(txt); } catch (e) { throw new Error(`${p}: ${e.message}`); }
};
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const samePath = (a, b) => real(a).toLowerCase() === real(b).toLowerCase();

/**
 * 补丁解析与「按宿主语义应用」都在 patch-parse.mjs 里：
 * 那边是 `@deepseek-ai/dsh-app-boot` 的 `applyEntryPatches` 的逐行移植，
 * 所以这里得出的入口列表 = 宿主实际会看到的那一份。
 */

// ── A. 插件包自身 ────────────────────────────────────────────────────────
function checkPlugin(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!exists(pkgPath)) { bad('plugin', '找到 package.json', pkgPath + ' 不存在'); return null; }
  let pkg;
  try { pkg = readJson(pkgPath); } catch (e) { bad('plugin', 'package.json 可解析', e.message); return null; }
  const name = pkg.name || '(没有 name)';
  ok('plugin', 'package.json 可解析', `${name}@${pkg.version ?? '?'}`);

  if (!pkg.name) bad('plugin', '声明 name', 'package.json 里没有 name');
  if (pkg.type !== 'module') warn('plugin', 'type: module', `当前是 ${pkg.type ?? '（未声明，按 CommonJS 处理）'}；DSH 插件走 ESM`, '在 package.json 加 "type": "module"');

  // 入口
  const exp = pkg.exports?.['.'] ?? pkg.main ?? 'index.js';
  const entryRel = typeof exp === 'string' ? exp : (exp.import ?? exp.default ?? 'index.js');
  const entryAbs = path.resolve(dir, entryRel);
  if (exists(entryAbs)) ok('plugin', '入口文件存在', entryRel);
  else bad('plugin', '入口文件存在', `${entryRel} 找不到（exports["."] = ${JSON.stringify(pkg.exports?.['.'])}）`);

  // 静态看导出（不 import，避免宿主依赖缺失时炸掉）
  if (exists(entryAbs)) {
    const src = fs.readFileSync(entryAbs, 'utf8');
    const hasApply = /\bexport\s+(async\s+)?function\s+apply\b|\bapply\s*[,}]\s*$|\bapply\s*:/.test(src);
    const hasName = /\bexport\s+const\s+name\b|\bname\s*[,}]\s*$/m.test(src);
    if (hasApply) ok('plugin', '导出 apply(ctx, config)', '找到 apply'); else bad('plugin', '导出 apply(ctx, config)', '入口里没看到 apply 导出', 'export function apply(ctx, config) {}');
    if (hasName) ok('plugin', '导出 name', '找到 name'); else warn('plugin', '导出 name', '没看到 `export const name`', 'export const name = "' + name + '"');
    if (/export\s+const\s+inject/.test(src)) ok('plugin', '声明 inject（可选）', '找到 inject');
  }

  // dsh.bundle.patch → cordis.patch.yml
  const patchRel = pkg.dsh?.bundle?.patch;
  if (!patchRel) {
    bad('plugin', 'dsh.bundle.patch 声明', 'package.json 里没有 dsh.bundle.patch —— 宿主不会读你的 cordis.patch.yml，插件等于没装',
      '{ "dsh": { "bundle": { "patch": "cordis.patch.yml" } } }');
  } else {
    const patchAbs = path.resolve(dir, patchRel);
    if (!exists(patchAbs)) bad('plugin', '补丁文件存在', patchRel + ' 不存在');
    else {
      let rows = null;
      try { rows = parsePatchYaml(fs.readFileSync(patchAbs, 'utf8')); }
      catch (e) { bad('plugin', 'cordis.patch.yml 可解析', e.message); }
      if (rows) {
        const { entries, warnings } = composeEntries([rows]);
        const self = entries.find((e) => e?.name === name) ?? entries[0];
        if (!self) {
          bad('plugin', '补丁能挂到入口树', '按宿主规则应用后没有任何入口', '- insert:\n    - id: hippocampus\n      name: ' + name);
        } else {
          ok('plugin', '补丁能挂到入口树', `${rows.length} 条补丁 → ${entries.length} 个入口；首个 id=${self.id ?? '?'} name=${self.name ?? '?'}`);
          if (self.name !== name) warn('plugin', 'insert.name 与包名一致', `insert.name=${self.name} ≠ package.name=${name}`, `把 name 改成 ${name}`);
          if (!self.id) warn('plugin', 'insert.id（命名空间）', '没有 id：宿主会拿不到稳定命名空间', 'id: ' + name);
          if (warnings.length) warn('plugin', '宿主应用补丁时无告警', warnings.join('；'));
          else ok('plugin', '宿主应用补丁时无告警', '0 条');
        }
      }
    }
  }

  // peer 依赖
  const peers = Object.keys(pkg.peerDependencies ?? {});
  const toolsPeer = peers.find((k) => k.includes('dsh-tools'));
  if (toolsPeer) ok('plugin', '声明 @deepseek-ai/dsh-tools 为 peer', toolsPeer + ' @ ' + pkg.peerDependencies[toolsPeer]);
  else warn('plugin', '声明 @deepseek-ai/dsh-tools 为 peer', '没声明；装到没带这个包的宿主里会 import 失败', 'peerDependencies: { "@deepseek-ai/dsh-tools": "^0.2.0" }');
  if (pkg.peerDependenciesMeta && typeof pkg.peerDependenciesMeta === 'object') ok('plugin', 'peer 标记 optional', JSON.stringify(pkg.peerDependenciesMeta));

  return { dir, name, pkg, entryAbs };
}

// ── B. profile 登记 ──────────────────────────────────────────────────────
function defaultProfile() {
  const homes = [
    process.env.DSH_HOME,
    path.join(os.homedir(), '.dsh'),
    // 桌面版（Windows）：安装器把 harness 放在 %APPDATA%\dsh-desktop\harness
    process.env.APPDATA ? path.join(process.env.APPDATA, 'dsh-desktop', 'harness') : null,
    process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, 'dsh-desktop', 'harness') : null,
  ].filter(Boolean);
  for (const home of homes) {
    for (const p of [path.join(home, 'profiles', 'web'), path.join(home, 'profiles', 'desktop')]) {
      if (exists(path.join(p, 'package.json'))) return p;
    }
    const base = path.join(home, 'profiles');
    if (exists(base)) {
      const d = fs.readdirSync(base).find((n) => exists(path.join(base, n, 'package.json')));
      if (d) return path.join(base, d);
    }
  }
  return null;
}

function checkProfile(profileDir, plugin) {
  const pkgPath = path.join(profileDir, 'package.json');
  if (!exists(pkgPath)) { bad('profile', '找到 profile', profileDir + ' 里没有 package.json'); return; }
  let pkg;
  try { pkg = readJson(pkgPath); } catch (e) { bad('profile', 'profile 的 package.json 可解析', e.message); return; }
  ok('profile', '找到 profile', profileDir);

  // 1) dependencies
  const deps = pkg.dependencies ?? {};
  const spec = deps[plugin.name];
  const addCmd = `dsh plugin --profile ${path.basename(profileDir)} add "link:${plugin.dir}"`;
  if (!spec) {
    bad('profile', 'dependencies 里有这个包', `没有 ${plugin.name}`, addCmd);
  } else if (String(spec).startsWith('link:')) {
    const target = path.resolve(profileDir, String(spec).slice(5));
    if (samePath(target, plugin.dir)) ok('profile', 'dependencies 路径指向本包', String(spec));
    else bad('profile', 'dependencies 路径指向本包', `${spec} → ${real(target)}，但本包在 ${real(plugin.dir)}`, addCmd);
  } else {
    warn('profile', 'dependencies 用 link: 指向本包', `当前是 ${spec}（版本/git 依赖）；本地开发建议 link:`, addCmd);
  }

  // 2) bundles（加载顺序表）
  const bundles = pkg.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) bad('profile', 'dsh.profile.bundles 存在', 'profile 里没有 dsh.profile.bundles 数组');
  else if (!bundles.includes(plugin.name)) bad('profile', 'bundles 里登记了', `bundles 里没有 ${plugin.name} —— 就算装了也不会被加载`, '在 dsh.profile.bundles 里加 "' + plugin.name + '"（或用 dsh plugin add）');
  else ok('profile', 'bundles 里登记了', `${plugin.name}（第 ${bundles.indexOf(plugin.name) + 1}/${bundles.length} 位）`);

  // 3) 落盘可见性
  const nm = path.join(profileDir, 'node_modules', plugin.name);
  if (exists(nm)) ok('profile', 'node_modules 里能解析到', nm);
  else warn('profile', 'node_modules 里能解析到', nm + ' 不存在 —— 还没跑安装（pnpm install / dsh plugin add）', '在 profile 目录跑 pnpm install --ignore-scripts，或直接用 dsh plugin add');
}

// ── 主流程（只有直接运行时才跑；被 install.mjs import 时只提供函数）────────
if (isMain) {
  const plugin = checkPlugin(opt.plugin);
  const profileDir = opt.pluginOnly ? null : (opt.profile ? path.resolve(opt.profile) : defaultProfile());
  if (opt.pluginOnly) {
    // 只管包自洽（CI / 发布前用）
  } else if (!profileDir) bad('profile', '找到 profile', '没找到任何 profile（试过 $DSH_HOME/profiles/*、~/.dsh、%APPDATA%\\dsh-desktop\\harness）', '--profile <你的 profile 目录>');
  else if (plugin) checkProfile(profileDir, plugin);

  const bads = results.filter((r) => r.level === 'bad');
  const warns = results.filter((r) => r.level === 'warn');

  if (opt.json) {
    console.log(JSON.stringify({ plugin: plugin?.name ?? null, profile: profileDir, ok: bads.length === 0, results }, null, 2));
  } else {
    printResults();
    console.log('');
    if (!bads.length) console.log(`结论：静态检查通过${warns.length ? `（${warns.length} 条注意项）` : ''}。尚未执行 DSH 启动；重启后需确认插件激活。`);
    else console.log(`结论：还装不上——${bads.length} 项要修${warns.length ? `，另有 ${warns.length} 条注意项` : ''}。`);
  }

  process.exit(bads.length ? 1 : 0);
}

export {
  checkPlugin,
  checkProfile,
  defaultProfile,
  results,
  printResults,
  resetResults,
  readJson,
  exists,
  samePath,
};
