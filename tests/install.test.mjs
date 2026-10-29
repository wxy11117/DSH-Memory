/**
 * install.test.mjs — 给 tools/check-install.mjs 自己上测试。
 *
 * 为什么值得测：这个脚本的作用是「告诉别人为什么装不上」，
 * 它自己误报（把装得上的说成装不上）比没有更坏。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(PKG_DIR, 'tools', 'check-install.mjs');

function run(args, cwd = PKG_DIR) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}
const json = (args) => JSON.parse(run([...args, '--json']).out);
const titleOf = (res, title) => res.results.find((r) => r.title.startsWith(title));

function tempProfile(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-prof-'));
  const pkg = { name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles: [] } }, ...extra };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

test('--plugin-only：本包自洽，退出码 0', () => {
  const r = run(['--plugin-only', '--json']);
  assert.equal(r.code, 0, r.err);
  const res = JSON.parse(r.out);
  assert.equal(res.ok, true);
  assert.equal(res.plugin, 'dsh-hippocampus');
  assert.equal(res.results.some((x) => x.level === 'bad'), false);
  // 几个关键项必须在
  for (const t of ['package.json 可解析', '入口文件存在', '导出 apply', '补丁能挂到入口树', '宿主应用补丁时无告警']) {
    assert.ok(titleOf(res, t), `缺检查项：${t}`);
  }
});

test('空 profile：报「dependencies / bundles 都没有」，退出码 1', () => {
  const dir = tempProfile();
  try {
    const r = run(['--profile', dir, '--json']);
    assert.equal(r.code, 1);
    const res = JSON.parse(r.out);
    assert.equal(res.ok, false);
    assert.equal(titleOf(res, 'dependencies 里有这个包').level, 'bad');
    assert.equal(titleOf(res, 'bundles 里登记了').level, 'bad');
    // 修复建议必须给出来，否则用户不知道下一步
    assert.match(titleOf(res, 'dependencies 里有这个包').fix, /dsh plugin .* add "link:/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('登记了 dependencies 但漏了 bundles：仍然红（这正是「装了没反应」的经典原因）', () => {
  const dir = tempProfile();
  try {
    const p = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.dependencies['dsh-hippocampus'] = 'link:' + PKG_DIR.replaceAll('\\', '/');
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    const res = json(['--profile', dir]);
    assert.equal(res.ok, false);
    assert.equal(titleOf(res, 'dependencies 路径指向本包').level, 'ok');
    assert.equal(titleOf(res, 'bundles 里登记了').level, 'bad');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('dependencies + bundles 都有：全绿，退出码 0', () => {
  const dir = tempProfile();
  try {
    const p = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.dependencies['dsh-hippocampus'] = 'link:' + PKG_DIR.replaceAll('\\', '/');
    pkg.dsh.profile.bundles.push('dsh-hippocampus');
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    const r = run(['--profile', dir, '--json']);
    assert.equal(r.code, 0);
    const res = JSON.parse(r.out);
    assert.equal(res.ok, true);
    assert.equal(titleOf(res, 'bundles 里登记了').level, 'ok');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('link 指向别的地方：报路径不一致', () => {
  const dir = tempProfile();
  try {
    const p = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    pkg.dependencies['dsh-hippocampus'] = 'link:/totally/other/place';
    pkg.dsh.profile.bundles.push('dsh-hippocampus');
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    const res = json(['--profile', dir]);
    assert.equal(res.ok, false);
    assert.equal(titleOf(res, 'dependencies 路径指向本包').level, 'bad');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('profile 的 package.json 带 BOM 也能读（Windows 上很常见）', () => {
  const dir = tempProfile();
  try {
    const p = path.join(dir, 'package.json');
    const txt = fs.readFileSync(p, 'utf8');
    fs.writeFileSync(p, '\uFEFF' + txt);
    const res = json(['--profile', dir]);
    assert.equal(titleOf(res, '找到 profile').level, 'ok');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('profile 的 package.json 坏掉：报错但不崩', () => {
  const dir = tempProfile();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{ 这不是 json ');
    const r = run(['--profile', dir, '--json']);
    assert.equal(r.code, 1);
    assert.equal(r.err.trim(), '', '不应该抛栈到 stderr：' + r.err);
    assert.equal(titleOf(JSON.parse(r.out), 'profile 的 package.json 可解析').level, 'bad');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--help 打印用法且退出 0', () => {
  const r = run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /check-install\.mjs/);
  assert.match(r.out, /--plugin-only/);
});

test('未知参数退出 2', () => {
  assert.equal(run(['--nope']).code, 2);
});
