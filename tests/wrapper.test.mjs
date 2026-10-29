// install.ps1 / install.cmd 的包装层测试。
//
// 为什么值得测：这两个文件是「双击就能装」那条路的第一道门，而 PowerShell 脚本最容易死在
// 语法错误与编码上（本机只有 PowerShell 5.1，中文必须先有 UTF-8 BOM）。跑一遍 -Help / -CheckNode
// 就等于让 PowerShell 真的解析了一次脚本；-Dry 则验证它确实把参数交给了 install.mjs。
//
// 非 Windows 自动跳过（这两个包装层本来就只有 Windows 用得上）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PS1 = path.join(ROOT, 'tools', 'install.ps1');
const CMD = path.join(ROOT, 'tools', 'install.cmd');
const isWin = process.platform === 'win32';
const skip = isWin ? undefined : '只有 Windows 用得上这两个包装层';

function runPs(args) {
  return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true
  });
}

test('两个包装文件都在，且 install.cmd 只是转交 install.ps1', () => {
  assert.ok(fs.existsSync(PS1), '没有 tools/install.ps1');
  assert.ok(fs.existsSync(CMD), '没有 tools/install.cmd');

  const cmd = fs.readFileSync(CMD, 'utf8');
  assert.match(cmd, /install\.ps1/, 'install.cmd 应该调 install.ps1');
  assert.match(cmd, /-ExecutionPolicy\s+Bypass/, '应该带 Bypass，否则默认策略会拦下 .ps1');
  assert.match(cmd, /%\*/, '应该把参数原样转发（%*）');
});

test('install.ps1 有 UTF-8 BOM（PS 5.1 读中文全靠它）', { skip }, () => {
  const buf = fs.readFileSync(PS1);
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'install.ps1 少了 UTF-8 BOM');
});

test('PowerShell 能解析并通过 -Help 退出 0', { skip }, () => {
  const r = runPs(['-Help']);
  assert.equal(r.status, 0, `-Help 退出码应为 0，实际 ${r.status}；stderr=${r.stderr}`);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /install\.mjs/, '-Help 应该提到 install.mjs');
  assert.match(out, /-Uninstall/, '-Help 应该列出 -Uninstall');
});

test('-CheckNode 能找到 node 并打印版本（找不到就退出 1，不会假装成功）', { skip }, () => {
  const r = runPs(['-CheckNode']);
  const out = `${r.stdout}${r.stderr}`;

  if (r.status === 0) {
    assert.match(out, /node/i, '应该说明用的是哪个 node');
    assert.match(out, /v\d+\.\d+\.\d+/, '应该打印出 node 的版本号');
  } else {
    // 机器上真的没有 node：必须给可执行的三条路，而不是空白
    assert.equal(r.status, 1, `预期 0 或 1，实际 ${r.status}`);
    assert.match(out, /nodejs\.org|DSH_HIPPOCAMPUS_NODE/, '找不到 node 时要给出解决办法');
  }
});

test('-Dry 会把 --dry 交给 install.mjs，且明确说不写文件', { skip }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-wrap-'));
  const profileDir = path.join(home, 'profiles', 'web');
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, 'package.json'),
    JSON.stringify({ name: 'web', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2)
  );

  const r = runPs(['-Dry', '-Profile', profileDir]);
  const out = `${r.stdout}${r.stderr}`;

  assert.equal(r.status, 0, `-Dry 退出码应为 0，实际 ${r.status}\n${out}`);
  assert.match(out, /试运行|--dry|不会写/, '应该说明这是试运行');
  assert.match(out, /dependencies\["dsh-hippocampus"\]|dsh-hippocampus/, '应该打印出真实计划');

  // 试运行绝不能真的改文件
  const after = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
  assert.deepEqual(after.dependencies, {}, '-Dry 不许写 dependencies');
  assert.deepEqual(after.dsh.profile.bundles, [], '-Dry 不许改 bundles');

  fs.rmSync(home, { recursive: true, force: true, maxRetries: 3 });
});
