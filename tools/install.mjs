#!/usr/bin/env node
/**
 * install.mjs —— 不需要 `dsh` 命令行的安装器。
 *
 * 为什么需要它：**桌面版 DSH 不带 `dsh` CLI**（本机实测 `dsh` 不在 PATH，
 * `%APPDATA%\npm\dsh.cmd` 也不存在）。README 里那条
 *   `dsh plugin --profile web add "link:..."`
 * 对「下载了 zip 的普通用户」根本跑不了。这个脚本做的事和它完全一样：
 *   1. 在 profile 的 `dependencies` 里写 `"<包名>": "link:<本包绝对路径>"`
 *   2. 把包名加进 `dsh.profile.bundles`（加载顺序表——不加就等于没装）
 *   3. 在 `node_modules/<包名>` 建一个链接（Windows 用 junction，不需要管理员权限）
 *   4. 用 check-install 的同一套判定跑一遍，绿了才说「装好了」
 *
 *   node tools/install.mjs                    # 自动找 profile（web 优先），装本包
 *   node tools/install.mjs --profile <dir>    # 指定 profile
 *   node tools/install.mjs --dry              # 只打印计划，不改文件
 *   node tools/install.mjs --uninstall        # 撤销（日志/记忆库不动）
 *   node tools/install.mjs --json
 *
 * 退出码：0 成功 / 1 失败或校验有 ✗ / 2 用法错误。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  checkPlugin, checkProfile, defaultProfile, results, printResults, resetResults, readJson,
} from './check-install.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const opt = { profile: null, dry: false, uninstall: false, json: false, help: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--profile') opt.profile = argv[++i];
  else if (a === '--dry' || a === '--dry-run') opt.dry = true;
  else if (a === '--uninstall' || a === '--remove') opt.uninstall = true;
  else if (a === '--json') opt.json = true;
  else if (a === '--help' || a === '-h') opt.help = true;
  else { console.error(`未知参数：${a}（--help 看用法）`); process.exit(2); }
}

if (opt.help) {
  console.log(`用法：
  node tools/install.mjs [--profile <profile 目录>] [--dry] [--json]
  node tools/install.mjs --uninstall [--profile <...>] [--dry]

不传 --profile 时按顺序找：$DSH_HOME、~/.dsh、%APPDATA%\\dsh-desktop\\harness、$XDG_CONFIG_HOME/dsh-desktop/harness
（在其下的 profiles/ 里优先取 web，其次 desktop，再到第一个带 package.json 的）。
只改 profile 的 package.json 与 node_modules 链接；记忆库与日志都不动。`);
  process.exit(0);
}

const say = (...a) => { if (!opt.json) console.log(...a); };
const toPosix = (p) => p.replace(/\\/g, '/');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

function fail(msg, detail) {
  if (opt.json) console.log(JSON.stringify({ ok: false, error: msg, detail }, null, 2));
  else { console.error(`✗ ${msg}${detail ? '：' + detail : ''}`); }
  process.exit(1);
}

/* ── 1. 本包 ─────────────────────────────────────────────────────────── */
let pkg;
try { pkg = readJson(path.join(PLUGIN_DIR, 'package.json')); } catch (e) { fail('读不到本包的 package.json', e.message); }
if (!pkg.name) fail('本包 package.json 没有 name');

/* ── 2. profile ──────────────────────────────────────────────────────── */
const profileDir = opt.profile ? path.resolve(opt.profile) : defaultProfile();
if (!profileDir) fail('没找到 DSH profile', '试过 $DSH_HOME、~/.dsh、%APPDATA%\\dsh-desktop\\harness；用 --profile <目录> 指定');
const profilePkgPath = path.join(profileDir, 'package.json');
if (!fs.existsSync(profilePkgPath)) fail('profile 里没有 package.json', profilePkgPath);

let ppkg;
try { ppkg = readJson(profilePkgPath); } catch (e) { fail('profile 的 package.json 解析失败', e.message); }
const profileName = path.basename(profileDir);

/* ── 3. 计划 ─────────────────────────────────────────────────────────── */
const plan = [];
const deps = ppkg.dependencies ?? {};
const wantSpec = 'link:' + toPosix(PLUGIN_DIR);
const curSpec = deps[pkg.name];
if (curSpec === wantSpec) plan.push({ act: 'skip', what: `dependencies["${pkg.name}"]`, why: '已经指向本包' });
else if (curSpec) plan.push({ act: 'set', what: `dependencies["${pkg.name}"]`, from: curSpec, to: wantSpec });
else plan.push({ act: 'add', what: `dependencies["${pkg.name}"]`, to: wantSpec });

const bundles = Array.isArray(ppkg.dsh?.profile?.bundles) ? ppkg.dsh.profile.bundles.slice() : null;
if (bundles === null) plan.push({ act: 'add', what: 'dsh.profile.bundles', to: `[${pkg.name}]（原来没有这个数组）` });
else if (!bundles.includes(pkg.name)) plan.push({ act: 'add', what: 'dsh.profile.bundles', to: `在末尾加 "${pkg.name}"` });
else plan.push({ act: 'skip', what: 'dsh.profile.bundles', why: `已登记（第 ${bundles.indexOf(pkg.name) + 1}/${bundles.length} 位）` });

const linkPath = path.join(profileDir, 'node_modules', pkg.name);
let linkState = 'missing';
try {
  const st = fs.lstatSync(linkPath);
  linkState = st.isSymbolicLink() ? 'link' : 'dir';
  if (linkState === 'link' && path.resolve(fs.readlinkSync(linkPath)) === PLUGIN_DIR) linkState = 'ours';
} catch { /* 不存在 */ }
if (linkState === 'ours') plan.push({ act: 'skip', what: `node_modules/${pkg.name}`, why: '链接已指向本包' });
else plan.push({ act: 'link', what: `node_modules/${pkg.name}`, to: linkState === 'missing' ? wantSpec : `替换现有${linkState === 'dir' ? '目录' : '链接'} → ${PLUGIN_DIR}` });

const uninstallPlan = opt.uninstall ? [
  { act: 'del', what: `dependencies["${pkg.name}"]`, from: curSpec ?? '（本来就没有）' },
  { act: 'del', what: 'dsh.profile.bundles', from: bundles?.includes(pkg.name) ? `移除 "${pkg.name}"` : '（本来就没有）' },
  { act: 'del', what: `node_modules/${pkg.name}`, from: linkState === 'ours' ? '（链接指向本包，安全删除）' : linkState === 'missing' ? '（不存在）' : '（不是指向本包的链接，跳过）' },
] : plan;

const effective = uninstallPlan.filter((p) => p.act !== 'skip');

/* ── 4. 输出计划 ─────────────────────────────────────────────────────── */
if (!opt.json) {
  say(`插件：${pkg.name}@${pkg.version}`);
  say(`目录：${PLUGIN_DIR}`);
  say(`profile：${profileDir}（${profileName}）`);
  say(`动作：${opt.uninstall ? '卸载' : '安装'}${opt.dry ? '［试运行，不写文件］' : ''}`);
  say('');
  if (!effective.length) say('  已是目标状态，无需改动。');
  for (const p of effective) {
    const mark = p.act === 'del' ? '−' : '+';
    say(`  ${mark} ${p.what}`);
    if (p.from !== undefined && p.act !== 'del') say(`      旧：${p.from}`);
    if (p.to) say(`      新：${p.to}`);
    if (p.from !== undefined && p.act === 'del') say(`      ${p.from}`);
  }
}

if (opt.dry) {
  if (opt.json) console.log(JSON.stringify({ ok: true, dry: true, plugin: pkg.name, profile: profileDir, plan: effective }, null, 2));
  else say('\n（--dry：没有写任何文件）');
  process.exit(0);
}

/* ── 5. 落地 ─────────────────────────────────────────────────────────── */
const changedFiles = [];
if (effective.length) {
  // 先备份
  const bak = profilePkgPath + '.hp-backup-' + stamp;
  if (!opt.uninstall || effective.some((p) => p.what.startsWith('dependencies') || p.what.includes('bundles'))) {
    try { fs.copyFileSync(profilePkgPath, bak); changedFiles.push(path.basename(bak)); } catch (e) { fail('备份 profile/package.json 失败', e.message); }
  }

  if (opt.uninstall) {
    if (ppkg.dependencies && pkg.name in ppkg.dependencies) {
      delete ppkg.dependencies[pkg.name];
      if (!Object.keys(ppkg.dependencies).length) delete ppkg.dependencies;
    }
    const list = ppkg.dsh?.profile?.bundles;
    if (Array.isArray(list)) {
      const i = list.indexOf(pkg.name);
      if (i >= 0) list.splice(i, 1);
    }
  } else {
    ppkg.dependencies = ppkg.dependencies ?? {};
    ppkg.dependencies[pkg.name] = wantSpec;
    ppkg.dsh = ppkg.dsh ?? {};
    ppkg.dsh.profile = ppkg.dsh.profile ?? {};
    const list = Array.isArray(ppkg.dsh.profile.bundles) ? ppkg.dsh.profile.bundles : [];
    if (!list.includes(pkg.name)) list.push(pkg.name);
    ppkg.dsh.profile.bundles = list;
  }

  try {
    fs.writeFileSync(profilePkgPath, JSON.stringify(ppkg, null, 2) + '\n', 'utf8');
    changedFiles.push('package.json');
  } catch (e) { fail('写 profile/package.json 失败', e.message); }

  // node_modules 链接
  try {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    if (opt.uninstall) {
      if (linkState === 'ours') { fs.unlinkSync(linkPath); changedFiles.push('node_modules/' + pkg.name + '（已删）'); }
    } else {
      if (linkState !== 'ours') {
        if (linkState !== 'missing') fs.rmSync(linkPath, { recursive: true, force: true });
        fs.symlinkSync(PLUGIN_DIR, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
        changedFiles.push('node_modules/' + pkg.name + '（新链接）');
      }
    }
  } catch (e) { fail('建 node_modules 链接失败', e.message); }
}

/* ── 6. 自己验一遍（和 check-install 同一套判定）──────────────────────── */
resetResults();
const pluginInfo = checkPlugin(PLUGIN_DIR);

if (opt.uninstall) {
  // 卸载后「profile 里查不到它」才是成功——所以不能拿 checkProfile 的红项当失败。
  const after = readJson(profilePkgPath);
  const leftDeps = after.dependencies && pkg.name in after.dependencies;
  const leftBundles = Array.isArray(after.dsh?.profile?.bundles) && after.dsh.profile.bundles.includes(pkg.name);
  let leftLink = false;
  try { leftLink = fs.lstatSync(linkPath).isSymbolicLink(); } catch { /* 不存在=好 */ }
  const dirty = [leftDeps && 'dependencies', leftBundles && 'dsh.profile.bundles', leftLink && `node_modules/${pkg.name}`].filter(Boolean);
  const bads = pluginInfo === null ? [{ level: 'bad', title: '插件包本身读不了' }] : results.filter((r) => r.level === 'bad');

  if (opt.json) {
    console.log(JSON.stringify({ ok: !dirty.length && !bads.length, uninstalled: true, plugin: pkg.name, profile: profileDir, changed: changedFiles, leftover: dirty, results }, null, 2));
  } else {
    printResults();
    console.log('');
    if (dirty.length) console.error(`✗ 还有残渣：${dirty.join('、')}`);
    else {
      const warns = results.filter((r) => r.level === 'warn');
      console.log(`✓ 已从 profile「${profileName}」撤销${warns.length ? `（插件包自身 ${warns.length} 条注意项，与卸载无关）` : ''}。记忆库没动。`);
      if (changedFiles.length) console.log(`  改动：${changedFiles.join('、')}`);
    }
  }
  process.exit(dirty.length ? 1 : 0);
}

if (pluginInfo) checkProfile(profileDir, pluginInfo);
const bads = results.filter((r) => r.level === 'bad');
const warns = results.filter((r) => r.level === 'warn');

if (opt.json) {
  console.log(JSON.stringify({
    ok: bads.length === 0,
    plugin: pkg.name,
    version: pkg.version,
    profile: profileDir,
    changed: changedFiles,
    plan: effective,
    results,
  }, null, 2));
} else {
  printResults();
  console.log('');
  if (!bads.length) {
    console.log(`✓ 装好了${warns.length ? `（${warns.length} 条注意项）` : ''}。**重启 DSH 生效**，之后对话里会出现 hp_* 工具。`);
    if (changedFiles.length) console.log(`  改动：${changedFiles.join('、')}`);
  } else {
    console.log(`✗ 还有 ${bads.length} 项没过——按上面 → 的提示改，或把这段输出贴出来。`);
  }
}

process.exit(bads.length ? 1 : 0);
