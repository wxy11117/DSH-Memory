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
import { stagePluginLink } from './plugin-link.mjs';
import { FIRST_USE_MESSAGE } from '../lib/onboarding.mjs';
import { installConflicts } from './install-preflight.mjs';
import {
  checkPlugin, checkProfile, defaultProfile, results, printResults, resetResults, readJson,
} from './check-install.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const opt = { profile: null, plugin: null, dry: false, uninstall: false, json: false, help: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--profile') {
    opt.profile = argv[++i];
    if (!opt.profile || opt.profile.startsWith('--')) { console.error('--profile 需要完整 profile 目录'); process.exit(2); }
  }
  else if (a === '--plugin') {
    opt.plugin = argv[++i];
    if (!opt.plugin || opt.plugin.startsWith('--')) { console.error('--plugin 需要完整插件目录'); process.exit(2); }
  }
  else if (a === '--dry' || a === '--dry-run') opt.dry = true;
  else if (a === '--uninstall' || a === '--remove') opt.uninstall = true;
  else if (a === '--json') opt.json = true;
  else if (a === '--help' || a === '-h') opt.help = true;
  else { console.error(`未知参数：${a}（--help 看用法）`); process.exit(2); }
}

const PLUGIN_DIR = opt.plugin ? path.resolve(opt.plugin) : path.resolve(HERE, '..');

if (opt.help) {
  console.log(`用法：
  node tools/install.mjs [--profile <profile 目录>] [--dry] [--json]
  node tools/install.mjs --uninstall [--profile <...>] [--dry]
  node tools/install.mjs --plugin <保留的旧插件目录> [--profile <...>] [--dry]

不传 --profile 时按顺序找：$DSH_HOME、~/.dsh、%APPDATA%\\dsh-desktop\\harness、$XDG_CONFIG_HOME/dsh-desktop/harness
（在其下的 profiles/ 里优先取 web，其次 desktop，再到第一个带 package.json 的）。
只改 profile 的 package.json 与 node_modules 链接；记忆库与日志都不动。
小屋预览版实际安装必须明确传 --profile，不自动覆盖日常使用的环境。
先运行 tools/preview-room.cmd 可独立看效果。`);
  process.exit(0);
}

const say = (...a) => { if (!opt.json) console.log(...a); };
const toPosix = (p) => p.replace(/\\/g, '/');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

function fail(msg, detail, nextSteps) {
  if (opt.json) console.log(JSON.stringify({ ok: false, error: msg, detail, nextSteps }, null, 2));
  else { console.error(`✗ ${msg}${detail ? '：' + detail : ''}`); if(nextSteps)for(const step of nextSteps)console.error('  '+step); }
  process.exit(1);
}
const previewNextSteps = [
  '只看效果：运行 tools/preview-room.cmd；不会安装到 DSH。',
  '新建测试环境：先确认 hp-memory-test 这个 profile 尚不存在。已安装 DSH CLI 时运行 dsh hp-memory-test --from-default-profile web --dump-config。不要对日常 web 使用重建参数。',
  '桌面版启动器路径及独立 homeDir 示例见 docs/LOCAL-TRIAL.md；同一 DSH_HOME 下的会话列表和定时任务仍共享。',
  '准备好测试配置后运行 node tools/install.mjs --profile "<DSH_HOME>/profiles/hp-memory-test" --dry；检查通过再去掉 --dry。',
  '要保留旧记忆：先 node tools/migrate.mjs --from "<旧 brain.json>" --list；按 docs/MIGRATE-SPACES.md 复制到新目录，不要删除旧库。',
];

/* ── 1. 本包 ─────────────────────────────────────────────────────────── */
let pkg;
try { pkg = readJson(path.join(PLUGIN_DIR, 'package.json')); } catch (e) { fail('读不到本包的 package.json', e.message); }
if (pkg.name !== 'dsh-hippocampus') fail('指定目录不是 dsh-hippocampus 插件包');
const supportsSpaceSetup = fs.existsSync(path.join(PLUGIN_DIR, 'lib', 'spaces.mjs'));
if (!opt.uninstall) {
  resetResults();
  const targetInfo = checkPlugin(PLUGIN_DIR);
  const targetErrors = results.filter(row => row.level === 'bad');
  if (!targetInfo || targetErrors.length) fail('指定插件目录不完整，未修改安装登记', targetErrors.map(row => row.title).join('；'));
  resetResults();
}
const roomPreview = /^0\.3\.0-preview\./.test(pkg.version || '');
if (roomPreview && !opt.profile && !opt.dry && !opt.uninstall) fail('小屋预览版需要显式指定测试 profile', '本次没有改动安装登记', previewNextSteps);

/* ── 2. profile ──────────────────────────────────────────────────────── */
const profileDir = opt.profile ? path.resolve(opt.profile) : defaultProfile();
if (!profileDir) fail('没找到 DSH profile', '试过 $DSH_HOME、~/.dsh、%APPDATA%\\dsh-desktop\\harness；用 --profile <目录> 指定');
const profilePkgPath = path.join(profileDir, 'package.json');
if (!fs.existsSync(profilePkgPath)) fail('profile 里没有 package.json', profilePkgPath);

let ppkg;
try { ppkg = readJson(profilePkgPath); } catch (e) { fail('profile 的 package.json 解析失败', e.message); }
const profileName = path.basename(profileDir);
if(roomPreview&&!opt.uninstall){
  let conflicts;
  try{conflicts=installConflicts(profileDir,PLUGIN_DIR,ppkg);}catch{fail('无法可靠解析安装配置，未修改任何登记','本版支持官方注释 + [] 空模板；复杂 YAML / 表达式超出本地解析范围时仍拒绝安装，不会删除原补丁',previewNextSteps);}
  if(conflicts.length)fail('安装前检查发现配置冲突，未修改任何登记',conflicts.join('；'),previewNextSteps);
}

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
  if (linkState === 'link' && path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath)) === PLUGIN_DIR) linkState = 'ours';
} catch (error) { if (error.code !== 'ENOENT') fail('读取现有插件链接失败', error.message); }
if (linkState === 'ours') plan.push({ act: 'skip', what: `node_modules/${pkg.name}`, why: '链接已指向本包' });
else plan.push({ act: 'link', what: `node_modules/${pkg.name}`, to: linkState === 'missing' ? wantSpec : `替换现有${linkState === 'dir' ? '目录（保留为备份）' : '链接（只移除链接自身）'} → ${PLUGIN_DIR}` });

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

  // Prepare the new link before changing registration. Keep the old entry
  // available for rollback; a junction must never be passed to recursive rm.
  let linkChange;
  let registrationAttempted = false;
  try {
    fs.mkdirSync(path.dirname(linkPath), { recursive: true });
    if (!opt.uninstall && linkState !== 'ours') linkChange = stagePluginLink(linkPath, PLUGIN_DIR);
    registrationAttempted = true;
    fs.writeFileSync(profilePkgPath, JSON.stringify(ppkg, null, 2) + '\n', 'utf8');
    changedFiles.push('package.json');
    if (opt.uninstall) {
      if (linkState === 'ours') { fs.unlinkSync(linkPath); changedFiles.push('node_modules/' + pkg.name + '（已删）'); }
    } else if (linkChange) {
      const retained = linkChange.commit();
      changedFiles.push('node_modules/' + pkg.name + '（新链接）');
      if (retained) {
        changedFiles.push('node_modules/' + path.basename(retained) + '（旧目录备份，已保留）');
        say('  已保留旧目录备份：' + retained);
      }
    }
  } catch (e) {
    const problems = [e.message];
    try { linkChange?.rollback(); } catch (restoreError) { problems.push('链接回退：' + restoreError.message); }
    if (registrationAttempted) {
      try { fs.copyFileSync(bak, profilePkgPath); } catch (restoreError) { problems.push('登记回退：' + restoreError.message); }
    }
    fail('安装变更未完成', problems.join('；'));
  }
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
    ...(supportsSpaceSetup ? { firstUse: { message: FIRST_USE_MESSAGE, nextTool: 'hp_space' } } : {}),
  }, null, 2));
} else {
  printResults();
  console.log('');
  if (!bads.length) {
    console.log(`✓ 安装登记与静态自检通过${warns.length ? `（${warns.length} 条注意项）` : ''}。请重启 DSH，并确认 hp_* 工具已激活；本检查不代替宿主启动验证。`);
    if (supportsSpaceSetup) {
      console.log('首次使用：' + FIRST_USE_MESSAGE);
      console.log('  默认 bound 模式：在每只鱼的会话中调用 hp_space，打开完整设置链接并确认归属；未选择前不会读写记忆。');
    }
    if (changedFiles.length) console.log(`  改动：${changedFiles.join('、')}`);
  } else {
    console.log(`✗ 还有 ${bads.length} 项没过——按上面 → 的提示改，或把这段输出贴出来。`);
  }
}

process.exit(bads.length ? 1 : 0);
