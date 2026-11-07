/**
 * install-flow.test.mjs —— 用独立包副本和临时 profile 跑安装器子进程。
 *
 * 守的是一条链：**别人下载 zip → 跑一条命令 → DSH 重启后工具就在**。
 * 这条链上最容易错的三处都在这里测：
 *   1. `dsh.profile.bundles` 有没有被加上（漏了就等于没装，且没有任何报错）
 *   2. `node_modules/<包名>` 的链接是否真指向本包（Windows 上要用 junction）
 *   3. 撤销后有没有留下残渣（依赖、bundles、链接）
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPackageFixture } from './helpers/package-fixture.mjs';

const fixture = createPackageFixture('hp-install-package-');
after(() => fixture.close());
const ROOT = fixture.packageDir;
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
  const dir = fs.mkdtempSync(path.join(fixture.root, 'profile-'));
  const pkg = { name: 'test-profile', version: '1.0.0', dependencies: { ...withDeps } };
  if (bundles !== null) pkg.dsh = { profile: { bundles: [...bundles] } };
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  return dir;
}

const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const linkAt = (dir) => path.join(dir, 'node_modules', NAME);

describe('install.mjs', () => {
  test('official commented [] profile installs without rewriting its YAML', () => {
    const dir=makeProfile(),file=path.join(dir,'cordis.patch.yml');
    const template='# Your patch layer for this dsh profile\r\n# a top-level YAML array of loader patch entries\r\n[]\r\n';
    fs.writeFileSync(file,template);
    assert.equal(run(['--profile',dir,'--dry']).code,0);
    assert.equal(fs.existsSync(linkAt(dir)),false);
    const installed=run(['--profile',dir]);assert.equal(installed.code,0,installed.err);
    assert.equal(fs.readFileSync(file,'utf8'),template);
    assert.equal(fs.existsSync(linkAt(dir)),true);
    assert.equal(run(['--profile',dir,'--uninstall']).code,0);
    assert.equal(fs.readFileSync(file,'utf8'),template);
  });

  test('预览版未指定 profile 时不触碰自动发现的日常环境', () => {
    const harness=path.join(fixture.root,'daily-home'),dir=path.join(harness,'profiles','web');
    fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,'package.json'),before='{"name":"daily","private":true}';fs.writeFileSync(file,before);
    const r=run([],{DSH_HOME:harness});
    assert.equal(r.code,1);assert.match(r.err,/显式指定测试 profile/);
    assert.equal(fs.readFileSync(file,'utf8'),before);assert.deepEqual(fs.readdirSync(dir),['package.json']);
  });

  for(const [label,patch] of [
    ['桥接配置','- id: hippocampus\n  config:\n    externalApi: http://127.0.0.1:3100\n    externalToken: do-not-print-this-value\n'],
    ['停用配置','- id: hippocampus\n  disabled: true\n'],
    ['重复入口','- insert:\n    - id: second-memory\n      name: dsh-hippocampus\n'],
  ])test(label+' 在写入前拒绝，配置和链接不变',()=>{
    const dir=makeProfile(),file=path.join(dir,'package.json'),before=fs.readFileSync(file);
    fs.writeFileSync(path.join(dir,'cordis.patch.yml'),patch);
    const result=run(['--profile',dir,'--json']);assert.equal(result.code,1);
    assert.equal(JSON.parse(result.out).ok,false);assert.doesNotMatch(result.out,/do-not-print-this-value/);
    assert.ok(JSON.parse(result.out).nextSteps.some(step=>step.includes('--dry')));
    assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.existsSync(linkAt(dir)),false);
    assert.equal(fs.readFileSync(path.join(dir,'cordis.patch.yml'),'utf8'),patch);
    assert.equal(fs.readdirSync(dir).some(n=>n.includes('hp-backup')),false);
  });

  test('相同工具家族的另一实例阻止叠装',()=>{
    const dir=makeProfile({bundles:['dsh-hippocampus-yan']});
    const result=run(['--profile',dir]);assert.equal(result.code,1);assert.match(result.err,/其他 hippocampus/);
    assert.equal(fs.existsSync(linkAt(dir)),false);
  });

  test('旧脑目录不在预览安装时原地接管',()=>{
    const dir=makeProfile(),old=path.join(fixture.root,'legacy-memory');fs.mkdirSync(old);
    fs.writeFileSync(path.join(old,'brain.json'),'private sentinel');
    fs.writeFileSync(path.join(dir,'cordis.patch.yml'),'- id: hippocampus\n  config:\n    homeDir: '+JSON.stringify(old)+'\n');
    const result=run(['--profile',dir]);assert.equal(result.code,1);assert.match(result.err,/旧记忆库/);
    assert.match(result.err,/tools\/migrate.mjs/);assert.match(result.err,/MIGRATE-SPACES.md/);
    assert.equal(fs.readFileSync(path.join(old,'brain.json'),'utf8'),'private sentinel');
  });

  test('缺少 --profile 的值是用法错误',()=>{
    assert.equal(run(['--profile']).code,2);assert.equal(run(['--profile','--dry']).code,2);
  });

  test('不完整解析不能掩盖后续桥接配置',()=>{
    const dir=makeProfile(),file=path.join(dir,'package.json'),before=fs.readFileSync(file);
    fs.writeFileSync(path.join(dir,'cordis.patch.yml'),'- id: unrelated\n  config:\n    prompt: |\n      multiline text\n- id: hippocampus\n  config:\n    externalApi: http://127.0.0.1:3100\n');
    const result=run(['--profile',dir,'--dry','--json']);assert.equal(result.code,1);
    assert.match(JSON.parse(result.out).error,/无法可靠解析/);
    assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.existsSync(linkAt(dir)),false);
  });

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
    assert.equal(fs.existsSync(path.join(ROOT, 'package.json')), true, '卸载不能删除源包');
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

  test('替换旧 junction 保留旧源包、脑文件、桥接配置和其它依赖', () => {
    const old = path.join(fixture.root, 'old-plugin');
    fs.mkdirSync(old);
    const sentinel = path.join(old, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'old source stays intact');
    const dir = makeProfile({ withDeps: { [NAME]: 'link:' + old.replace(/\\/g, '/'), other: '1.0.0' } });
    const brain = path.join(dir, 'brain.json'), patch = path.join(dir, 'cordis.patch.yml');
    fs.writeFileSync(brain, '{"testMemory":"keep"}');
    fs.writeFileSync(patch, '- id: hippocampus\n  config:\n    space: test-space\n');
    fs.symlinkSync(old, linkAt(dir), process.platform === 'win32' ? 'junction' : 'dir');
    const result = run(['--profile', dir]);
    assert.equal(result.code, 0, result.err);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'old source stays intact');
    assert.equal(fs.readFileSync(brain, 'utf8'), '{"testMemory":"keep"}');
    assert.equal(fs.readFileSync(patch, 'utf8'), '- id: hippocampus\n  config:\n    space: test-space\n');
    assert.equal(readPkg(dir).dependencies.other, '1.0.0');
    assert.equal(fs.realpathSync(linkAt(dir)), fs.realpathSync(ROOT));
  });

  test('替换真实安装目录时保留原目录备份', () => {
    const dir = makeProfile();
    fs.mkdirSync(linkAt(dir));
    fs.writeFileSync(path.join(linkAt(dir), 'old-content.txt'), 'preserve installed files');
    const result = run(['--profile', dir, '--json']);
    assert.equal(result.code, 0, result.err);
    const backup = fs.readdirSync(path.join(dir, 'node_modules')).find(name => name.startsWith(NAME + '.hp-backup-'));
    assert.ok(backup);
    assert.equal(fs.readFileSync(path.join(dir, 'node_modules', backup, 'old-content.txt'), 'utf8'), 'preserve installed files');
    assert.equal(JSON.parse(result.out).ok, true);
  });

  test('可用新安装器切回指定旧目录，不需要运行旧版清理代码', () => {
    const previous = createPackageFixture('hp-previous-');
    try {
      const dir = makeProfile();
      assert.equal(run(['--profile', dir]).code, 0);
      const snapshot = fs.readFileSync(path.join(ROOT, 'package.json'));
      const result = run(['--profile', dir, '--plugin', previous.packageDir]);
      assert.equal(result.code, 0, result.err);
      assert.equal(fs.realpathSync(linkAt(dir)), fs.realpathSync(previous.packageDir));
      assert.deepEqual(fs.readFileSync(path.join(ROOT, 'package.json')), snapshot);
      fs.unlinkSync(linkAt(dir));
    } finally { previous.close(); }
  });

  test('指定不完整的旧包时，在改动 profile 前拒绝安装', () => {
    const incomplete = path.join(fixture.root, 'incomplete-package');
    fs.mkdirSync(incomplete);
    fs.writeFileSync(path.join(incomplete, 'package.json'), JSON.stringify({ name: NAME, version: '0.1.10' }));
    const dir = makeProfile();
    const before = fs.readFileSync(path.join(dir, 'package.json'));
    const result = run(['--profile', dir, '--plugin', incomplete]);
    assert.equal(result.code, 1);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'package.json')), before);
    assert.equal(fs.existsSync(linkAt(dir)), false);
  });
});
