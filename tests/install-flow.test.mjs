/**
 * install-flow.test.mjs —— `tools/install.mjs` 的端到端测试（不 spawn 子进程，直接调函数）。
 *
 * 守的是一条链：**别人下载 zip → 跑一条命令 → DSH 重启后工具就在**。
 * 这条链上最容易错的三处都在这里测：
 *   1. `dsh.profile.bundles` 有没有被加上（漏了就等于没装，且没有任何报错）
 *   2. `node_modules/<包名>` 的链接是否真指向本包（Windows 上要用 junction）
 *   3. 撤销后有没有留下残渣（依赖、bundles、链接）
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INSTALLER = path.join(ROOT, 'tools', 'install.mjs');
const NAME = 'dsh-hippocampus';

/** 跑安装器；返回 { code, out, err } */
function run(args, env = {}) {
  const r = spawnSync(process.execPath, [INSTALLER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: ROOT,
  });
  if (r.error) throw r.error;
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function makeProfile({ bundles = ['other-plugin'], withDeps = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-prof-'));
  const pkg = { name: 'test-profile', version: '1.0.0', dependencies: { ...withDeps } };
  if (bundles !== null) pkg.dsh = { profile: { bundles: [...bundles] } };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  return dir;
}

const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const linkAt = (dir) => path.join(dir, 'node_modules', NAME);

describe('install.mjs', () => {
  test('--dry：只打印计划，一个字节都不写', () => {
    const dir = makeProfile();
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    const r = run(['--profile', dir, '--dry']);
    assert.equal(r.code, 0, r.err);
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before);
    assert.equal(fs.existsSync(linkAt(dir)), false);
    assert.match(r.out, /试运行/);
  });

  test('真装：dependencies + bundles + node_modules 链接三件齐', () => {
    const dir = makeProfile();
    const r = run(['--profile', dir]);
    assert.equal(r.code, 0, r.err);
    const pkg = readPkg(dir);
    assert.equal(pkg.dependencies[NAME], 'link:' + ROOT.replace(/\\/g, '/'));
    assert.deepEqual(pkg.dsh.profile.bundles, ['other-plugin', NAME]);
    assert.equal(fs.existsSync(linkAt(dir)), true);
    assert.equal(fs.realpathSync.native(linkAt(dir)).toLowerCase(), fs.realpathSync.native(ROOT).toLowerCase());
    assert.match(r.out, /安装登记与静态自检通过/);
    assert.match(r.out, /重启 DSH/);
  });

  test('装完的自检全绿（用 check-install 同一套判定）', () => {
    const dir = makeProfile();
    assert.equal(run(['--profile', dir]).code, 0);
    const r = run(['--profile', dir, '--json']);
    assert.equal(r.code, 0, r.err);
    const res = JSON.parse(r.out);
    assert.equal(res.ok, true);
    assert.deepEqual(res.results.filter((x) => x.level === 'bad'), []);
    assert.ok(res.results.some((x) => x.title === 'bundles 里登记了' && x.level === 'ok'));
    assert.ok(res.results.some((x) => x.title === 'node_modules 里能解析到' && x.level === 'ok'));
  });

  test('重复跑是幂等的：第二次不改文件，只说「已是目标状态」', () => {
    const dir = makeProfile();
    assert.equal(run(['--profile', dir]).code, 0);
    const snapshot = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    const r = run(['--profile', dir, '--dry']);
    assert.equal(r.code, 0);
    assert.match(r.out, /已是目标状态/);
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), snapshot);
  });

  test('profile 原来没有 dsh.profile.bundles → 自动建数组', () => {
    const dir = makeProfile({ bundles: null });
    assert.equal(run(['--profile', dir]).code, 0);
    assert.deepEqual(readPkg(dir).dsh.profile.bundles, [NAME]);
  });

  test('旧版本/别处的依赖会被覆盖成本包', () => {
    const dir = makeProfile({ withDeps: { [NAME]: 'link:C:/somewhere/else' } });
    const r = run(['--profile', dir]);
    assert.equal(r.code, 0);
    assert.equal(readPkg(dir).dependencies[NAME], 'link:' + ROOT.replace(/\\/g, '/'));
    assert.match(r.out, /旧：link:C:\/somewhere\/else/);
  });

  test('--uninstall：依赖、bundles、链接都清掉，其它插件不动', () => {
    const dir = makeProfile();
    assert.equal(run(['--profile', dir]).code, 0);
    const r = run(['--profile', dir, '--uninstall']);
    assert.equal(r.code, 0, r.err);
    const pkg = readPkg(dir);
    assert.equal(NAME in (pkg.dependencies ?? {}), false);
    assert.deepEqual(pkg.dsh.profile.bundles, ['other-plugin']);
    assert.equal(fs.existsSync(linkAt(dir)), false);
    assert.match(r.out, /撤销/);
  });

  test('--uninstall --dry 不会删东西', () => {
    const dir = makeProfile();
    assert.equal(run(['--profile', dir]).code, 0);
    const r = run(['--profile', dir, '--uninstall', '--dry']);
    assert.equal(r.code, 0);
    assert.equal(fs.existsSync(linkAt(dir)), true);
    assert.equal(readPkg(dir).dependencies[NAME] !== undefined, true);
  });

  test('profile 不存在 → 退出码 1 且给出原因', () => {
    const ghost = path.join(os.tmpdir(), 'hp-no-such-profile-' + Date.now());
    const r = run(['--profile', ghost]);
    assert.equal(r.code, 1);
    assert.match(r.err, /profile 里没有 package.json/);
  });

  test('未知参数 → 退出码 2', () => {
    assert.equal(run(['--nope']).code, 2);
  });

  test('--help 打印用法且退出码 0', () => {
    const r = run(['--help']);
    assert.equal(r.code, 0);
    assert.match(r.out, /--uninstall/);
  });
});
