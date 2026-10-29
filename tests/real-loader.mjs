/**
 * tests/real-loader.mjs —— 用**宿主真实的 profile 加载器**跑一遍：我们的包会不会被挂上去。
 *
 * 和另外两个测试的分工：
 *   · `loader.test.mjs`       —— 我们自己移植的 applyEntryPatches（补丁语义的单元测试）
 *   · `real-host.mjs`         —— 真实 `defineTool` / `ctx.systemPrompt.section` 的契约（工具 + 注入）
 *   · **`real-loader.mjs`**   —— 真实 `loadProfileDirectory` + `composeEntries`：从 profile 的
 *                                `dsh.profile.bundles` 出发，真的去解析我们的包、读 `dsh.bundle.patch`、
 *                                加载补丁、合成入口树。仅验证入口解析，不执行 Cordis 插件激活。
 *   · `real-cordis.mjs`        —— 真实 Cordis 代理权限、依赖等待、激活、服务更换与卸载。
 *
 * 需要宿主包（从 DSH 桌面版 app.asar 解出来的 @deepseek-ai/*）：
 *   set DSH_HOST_MODULES=C:\path\to\node_modules\@deepseek-ai
 * 不设时跳过（退出码 0），普通用户 `npm test` 不受影响。
 *
 * 做法：造一个临时 Harness home：
 *   %TEMP%\hp-loader-<rand>\profiles\web\package.json   → bundles: ["dsh-hippocampus"]
 *   %TEMP%\hp-loader-<rand>\profiles\web\node_modules\dsh-hippocampus → 指向本仓库
 * 然后调真加载器，断言：
 *   1. profile.layers 里正好一层，packageName 是我们
 *   2. 补丁路径解析到我们仓库里的 cordis.patch.yml
 *   3. composeEntries 之后入口树里有 id=hippocampus / name=dsh-hippocampus
 *   4. 宿主没有产生任何告警，也没有 skippedBundles
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const HOST = process.env.DSH_HOST_MODULES;
if (!HOST) {
  console.log('跳过：未设置 DSH_HOST_MODULES（发布前自检用，普通测试不需要）');
  process.exit(0);
}
const bootEntry = path.join(HOST, 'dsh-app-boot', 'lib', 'index.js');
if (!fs.existsSync(bootEntry)) {
  console.error(`✗ DSH_HOST_MODULES 里没有 dsh-app-boot：${HOST}`);
  process.exit(1);
}
const boot = await import(pathToFileURL(bootEntry).href);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-loader-'));
const profileDir = path.join(tmp, 'profiles', 'web');
fs.mkdirSync(path.join(profileDir, 'node_modules'), { recursive: true });

// 1) 一个「已经装了本插件」的 profile
fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
  name: 'hp-loader-profile',
  version: '1.0.0',
  private: true,
  dependencies: { [pkg.name]: 'link:' + ROOT },
  dsh: { profile: { bundles: [pkg.name] } },
}, null, 2) + '\n');

// 2) 包在 profile 的 node_modules 里（和 install.mjs 装出来的结构一致）
const linkPath = path.join(profileDir, 'node_modules', pkg.name);
fs.symlinkSync(ROOT, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

// 3) 走真加载器：resolve 每个 bundle → 读 dsh.bundle.patch → 解析补丁
const installAnchor = path.join(profileDir, 'package.json');
let profile;
try {
  profile = boot.loadProfileDirectory('hp-test', profileDir, installAnchor, { userLayer: false });
} catch (error) {
  console.error('✗ 真加载器直接抛错（那就说明装上也挂不住）：');
  console.error('  ' + (error?.message ?? error));
  if (error?.cause) console.error('  cause: ' + (error.cause?.message ?? error.cause));
  process.exit(1);
}

console.log(`Harness home：${tmp}`);
console.log(`profile：${profile.name}`);
console.log(`加载到 ${profile.layers.length} 层`);

assert.equal(profile.layers.length, 1, '应该正好加载一层（我们的包）');
const layer = profile.layers[0];
assert.equal(layer.packageName, pkg.name);
// 宿主给的是 profile/node_modules 里那个链接路径（不是 realpath），所以两边都先解链接再比
assert.equal(
  fs.realpathSync.native(layer.packageDir).toLowerCase(),
  fs.realpathSync.native(ROOT).toLowerCase(),
  '包目录应该解析到本仓库',
);
console.log(`  ✓ 我们的包被认出来了：${layer.packageName}@${pkg.version}`);

assert.equal(layer.patchPaths.length, 1, '应该正好一条补丁文件');
// 同样是经过 node_modules 链接的路径，解链接再比；顺便检查末尾文件名
assert.equal(fs.realpathSync.native(layer.patchPaths[0]).toLowerCase(),
  fs.realpathSync.native(path.join(ROOT, 'cordis.patch.yml')).toLowerCase());
console.log(`  ✓ 补丁文件：${path.basename(layer.patchPaths[0])}（解析出 ${layer.patches.length} 条补丁行）`);

// 4) 合成入口树——和宿主 boot 时那一次 composeEntries 是同一个函数
const warnings = [];
const entries = boot.composeEntries(profile.layers.map((l) => l.patches), (msg) => warnings.push(msg));
const ours = entries.find((row) => row.id === 'hippocampus');
const oursByName = entries.find((row) => row.name === pkg.name);

assert.ok(ours, '入口树里应该有一条 id=hippocampus');
assert.ok(oursByName, `入口树里应该有一条 name=${pkg.name}`);
assert.equal(ours.name, pkg.name);
assert.deepEqual(warnings, [], '宿主应用补丁时不该有任何告警');
console.log(`  ✓ 入口树：${entries.length} 个入口，其中 ${ours.id} → ${ours.name}，告警 ${warnings.length} 条`);

// 5) 没被跳过（跳过意味着「装了但没加载」）
boot.reportSkippedBundles?.('hp-test', profile);
assert.deepEqual([...(profile.skippedBundles ?? [])], [], '不该有被跳过的 bundle');
console.log('  ✓ 没有被跳过的 bundle');

// 6) 兼容性判定（宿主用 dsh.client / engines 等判，我们的包应该是「没有问题」）
const exemptions = {};
if (typeof boot.evaluatePluginCompatibility === 'function') {
  const issue = boot.evaluatePluginCompatibility(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')),
    exemptions,
  );
  assert.equal(issue, undefined, `兼容性判定不该有问题，实际：${JSON.stringify(issue)}`);
  console.log('  ✓ 兼容性判定：无问题');
}

// 7) 清理
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n✓ 真实加载树检查通过：${pkg.name}@${pkg.version} 解析成入口 ${ours.id}（启动激活另由 real-cordis 验证）`);
