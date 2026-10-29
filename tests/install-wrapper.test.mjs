/** Windows wrapper regressions. Every candidate/profile lives in a temporary sandbox. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const systemRoot = process.env.SystemRoot || 'C:\\Windows';
const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hp-wrapper-'));
  t.after(() => {
    // Do not recursively remove any path outside the exact fixture created above.
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.match(path.basename(base), /^hp-wrapper-/);
    fs.rmSync(base, { recursive: true, force: true });
  });
  const tools = path.join(base, 'package with spaces', 'tools');
  fs.mkdirSync(tools, { recursive: true });
  for (const file of ['install.ps1', 'install.cmd']) fs.copyFileSync(path.join(root, 'tools', file), path.join(tools, file));
  fs.writeFileSync(path.join(tools, 'install.mjs'), `import fs from 'node:fs';
fs.writeFileSync(process.env.HP_WRAPPER_RESULT, JSON.stringify(process.argv.slice(2)));
process.exit(Number(process.env.HP_WRAPPER_EXIT || 0));\n`);

  // Windows environment names are case-insensitive; avoid leaving a second Path/APPDATA key.
  const overridden = new Set(['path', 'appdata', 'localappdata', 'programfiles', 'programfiles(x86)', 'temp', 'tmp', 'dsh_home', 'dsh_hippocampus_node', 'dsh_hippocampus_node_quiet']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !overridden.has(key.toLowerCase())));
  Object.assign(env, {
    PATH: `${path.dirname(powershell)};${path.join(systemRoot, 'System32')}`,
    APPDATA: path.join(base, 'appdata'),
    LOCALAPPDATA: path.join(base, 'localappdata'),
    ProgramFiles: path.join(base, 'programfiles'),
    'ProgramFiles(x86)': path.join(base, 'programfiles86'),
    TEMP: path.join(base, 'temp'),
    TMP: path.join(base, 'temp'),
    DSH_HOME: path.join(base, 'dsh-home'),
    HP_WRAPPER_RESULT: path.join(base, 'installer-args.json'),
    DSH_HIPPOCAMPUS_NODE_QUIET: '1',
  });
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'TEMP', 'DSH_HOME']) fs.mkdirSync(env[key], { recursive: true });
  const shim = path.join(env.APPDATA, 'dsh-desktop', 'harness', '.desktop-bin', 'node.cmd');
  const result = () => JSON.parse(fs.readFileSync(env.HP_WRAPPER_RESULT, 'utf8'));
  return { base, tools, env, shim, result };
}

function writeCmd(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `@echo off\r\n${body.replace(/\r?\n/g, '\r\n')}\r\n`);
}

function workingShim(file) {
  writeCmd(file, `"${process.execPath}" %*\nexit /b %errorlevel%`);
}

function run(f, args = [], throughCmd = false) {
  const executable = throughCmd ? path.join(systemRoot, 'System32', 'cmd.exe') : powershell;
  const command = throughCmd
    ? ['/d', '/s', '/c', `""${path.join(f.tools, 'install.cmd')}" ${args.map(a => `"${a}"`).join(' ')}"`]
    : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(f.tools, 'install.ps1'), ...args];
  const r = spawnSync(executable, command, {
    cwd: f.base, env: f.env, encoding: 'utf8', timeout: 30000,
    ...(throughCmd ? { windowsVerbatimArguments: true } : {}),
  });
  if (r.error) throw r.error;
  assert.deepEqual(fs.readdirSync(f.env.TEMP), [], 'runtime probe must be removed');
  return { code: r.status, out: r.stdout + r.stderr };
}

test('Windows wrapper runs a real ESM probe and -CheckNode does not install', { skip: !windows }, (t) => {
  const f = fixture(t);
  f.env.DSH_HIPPOCAMPUS_NODE = process.execPath;
  const r = run(f, ['-CheckNode']);
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.includes(process.versions.node), r.out);
  assert.equal(fs.existsSync(f.env.HP_WRAPPER_RESULT), false);
});

test('Windows wrapper rejects Node 20 and falls back to DSH node.cmd', { skip: !windows }, (t) => {
  const f = fixture(t);
  f.env.DSH_HIPPOCAMPUS_NODE = path.join(f.base, 'old node.cmd');
  writeCmd(f.env.DSH_HIPPOCAMPUS_NODE, 'echo DSH_HIPPOCAMPUS_NODE_VERSION=20.19.0\nexit /b 0');
  workingShim(f.shim);
  const profile = path.join(f.base, 'profile with spaces');
  const r = run(f, ['-Profile', profile, '-Dry']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /20\.19\.0/);
  assert.deepEqual(f.result(), ['--dry', '--profile', profile]);
});

test('Windows wrapper rejects a failed candidate even if it prints a valid version', { skip: !windows }, (t) => {
  const f = fixture(t);
  f.env.DSH_HIPPOCAMPUS_NODE = path.join(f.base, 'failed node.cmd');
  writeCmd(f.env.DSH_HIPPOCAMPUS_NODE, 'echo DSH_HIPPOCAMPUS_NODE_VERSION=24.1.0\nexit /b 7');
  workingShim(f.shim);
  const r = run(f, ['-Uninstall']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(f.result(), ['--uninstall']);
});

test('Windows wrapper rejects silent and version-only shims, then tries the next candidate', { skip: !windows }, (t) => {
  const f = fixture(t);
  f.env.DSH_HIPPOCAMPUS_NODE = path.join(f.base, 'silent node.cmd');
  writeCmd(f.env.DSH_HIPPOCAMPUS_NODE, 'exit /b 0');
  const bin = path.join(f.base, 'path-bin');
  writeCmd(path.join(bin, 'node.cmd'), 'echo v24.1.0\nexit /b 0');
  f.env.PATH = `${bin};${f.env.PATH}`;
  workingShim(f.shim);
  const r = run(f);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(f.result(), []);
});

test('Windows wrapper fails without a usable runtime and never invokes the installer', { skip: !windows }, (t) => {
  const f = fixture(t);
  f.env.DSH_HIPPOCAMPUS_NODE = path.join(f.base, 'old node.cmd');
  writeCmd(f.env.DSH_HIPPOCAMPUS_NODE, 'echo DSH_HIPPOCAMPUS_NODE_VERSION=20.19.0\nexit /b 0');
  const r = run(f);
  assert.equal(r.code, 1, r.out);
  assert.equal(fs.existsSync(f.env.HP_WRAPPER_RESULT), false);
});

test('Windows wrapper passes the installer failure code through install.ps1 and install.cmd', { skip: !windows }, (t) => {
  const f = fixture(t);
  workingShim(f.shim);
  f.env.HP_WRAPPER_EXIT = '37';
  const profile = path.join(f.base, 'another profile');
  for (const throughCmd of [false, true]) {
    const r = run(f, ['-Profile', profile, '-Dry'], throughCmd);
    assert.equal(r.code, 37, r.out);
    assert.deepEqual(f.result(), ['--dry', '--profile', profile]);
  }
});
