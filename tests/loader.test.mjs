/**
 * loader.test.mjs — 校验「补丁解析 + 按宿主语义应用」这一层。
 *
 * 被测对象是 `tools/patch-parse.mjs`：它把 `@deepseek-ai/dsh-app-boot` 的
 * `applyEntryPatches` 逐行搬了过来。这里逐条测它的语义，因为**补丁写错的表现是静默的**：
 * 宿主只在 stderr 打一行 `skipping profile bundle` 或直接忽略，插件看起来「装上了」但什么也没发生。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatchYaml, parseScalar, applyEntryPatches, composeEntries } from '../tools/patch-parse.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

describe('parsePatchYaml', () => {
  test('本插件真实的 cordis.patch.yml → 一条 insert，含 id/name/config', () => {
    const rows = parsePatchYaml(fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8'));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      insert: [{ id: 'hippocampus', name: 'dsh-hippocampus', config: { enabled: true } }],
    });
  });

  test('注释与空行被忽略，引号里的 # 不当注释', () => {
    const rows = parsePatchYaml([
      '# 顶层注释',
      '- insert:',
      '    - id: demo',
      '      name: "demo-plugin"   # 行尾注释',
      '      config:',
      '        note: "a # b"',
      '',
    ].join('\n'));
    assert.deepEqual(rows, [{ insert: [{ id: 'demo', name: 'demo-plugin', config: { note: 'a # b' } }] }]);
  });

  test('插进某个 group：补丁行自带 id + insert', () => {
    const rows = parsePatchYaml([
      '- id: existing-group',
      '  insert:',
      '    - id: child',
      '      name: child-plugin',
    ].join('\n'));
    assert.deepEqual(rows, [{ id: 'existing-group', insert: [{ id: 'child', name: 'child-plugin' }] }]);
  });

  test('多个顶层补丁与内联列表都解析正确', () => {
    const rows = parsePatchYaml([
      '- insert:',
      '    - id: a',
      '      name: pkg-a',
      '- id: a',
      '  inject: [tools, systemPrompt]',
      '  disabled: true',
    ].join('\n'));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], { id: 'a', inject: ['tools', 'systemPrompt'], disabled: true });
  });

  test('parseScalar：布尔 / 数字 / null / 内联对象', () => {
    assert.equal(parseScalar('true'), true);
    assert.equal(parseScalar('400'), 400);
    assert.equal(parseScalar('null'), null);
    assert.deepEqual(parseScalar('{ a: 1, b: "x" }'), { a: 1, b: 'x' });
    assert.equal(parseScalar('dsh-hippocampus'), 'dsh-hippocampus');
  });
});

describe('applyEntryPatches —— 对齐宿主语义', () => {
  test('无 id 的 insert：追加到根入口列表', () => {
    const out = applyEntryPatches([], [{ insert: [{ id: 'x', name: 'x-pkg' }] }]);
    assert.deepEqual(out, [{ id: 'x', name: 'x-pkg' }]);
  });

  test('带 id 的 insert：只接受 group，插进它的 config 数组', () => {
    const data = [{ id: 'grp', name: 'group-pkg', group: true, config: [{ id: 'a', name: 'a-pkg' }] }];
    const out = applyEntryPatches(data, [{ id: 'grp', insert: [{ id: 'b', name: 'b-pkg' }] }]);
    assert.deepEqual(out[0].config.map((e) => e.id), ['a', 'b']);
  });

  test('带 id 的 insert 但目标不是 group → 告警且不插入', () => {
    const warnings = [];
    const data = [{ id: 'plain', name: 'plain-pkg' }];
    const out = applyEntryPatches(data, [{ id: 'plain', insert: [{ id: 'z', name: 'z-pkg' }] }], (m) => warnings.push(m));
    assert.equal(out.length, 1);
    assert.match(warnings[0], /is not a group/);
  });

  test('带 id 的 insert 但目标不存在 → 告警', () => {
    const warnings = [];
    applyEntryPatches([], [{ id: 'nope', insert: [{ id: 'z', name: 'z-pkg' }] }], (m) => warnings.push(m));
    assert.match(warnings[0], /not found/);
  });

  test('非 insert 补丁必须有 id', () => {
    const warnings = [];
    const out = applyEntryPatches([{ id: 'a', name: 'a-pkg' }], [{ disabled: true }], (m) => warnings.push(m));
    assert.equal(out[0].disabled, undefined);
    assert.match(warnings[0], /id is required/);
  });

  test('非 insert 补丁覆盖字段（config / disabled / inject）', () => {
    const data = [{ id: 'a', name: 'a-pkg', config: { enabled: true } }];
    const out = applyEntryPatches(data, [{ id: 'a', config: { enabled: false, space: 'owner' }, disabled: true }]);
    assert.deepEqual(out[0].config, { enabled: false, space: 'owner' });
    assert.equal(out[0].disabled, true);
  });

  test('name 与目标不一致 → 告警并跳过（防止改错同名插件）', () => {
    const warnings = [];
    const out = applyEntryPatches([{ id: 'a', name: 'a-pkg', config: {} }],
      [{ id: 'a', name: 'other-pkg', config: { x: 1 } }], (m) => warnings.push(m));
    assert.deepEqual(out[0].config, {});
    assert.match(warnings[0], /name mismatch/);
  });

  test('不改动传入的数组（结构化克隆）', () => {
    const data = [{ id: 'a', name: 'a-pkg', config: { n: 1 } }];
    const snapshot = JSON.stringify(data);
    applyEntryPatches(data, [{ id: 'a', config: { n: 2 } }]);
    assert.equal(JSON.stringify(data), snapshot);
  });
});

describe('composeEntries —— 多层叠加顺序', () => {
  test('后者覆盖前者：bundle 的 config 被 profile 那层改写', () => {
    const bundle = [{ insert: [{ id: 'hp', name: 'dsh-hippocampus', config: { enabled: true } }] }];
    const profile = [{ id: 'hp', config: { enabled: true, space: 'mine' } }];
    const { entries, warnings } = composeEntries([bundle, profile]);
    assert.deepEqual(entries, [{ id: 'hp', name: 'dsh-hippocampus', config: { enabled: true, space: 'mine' } }]);
    assert.deepEqual(warnings, []);
  });

  test('两层 insert 都进根列表，保持顺序', () => {
    const a = [{ insert: [{ id: 'a', name: 'a-pkg' }] }];
    const b = [{ insert: [{ id: 'b', name: 'b-pkg' }] }];
    const { entries } = composeEntries([a, b]);
    assert.deepEqual(entries.map((e) => e.id), ['a', 'b']);
  });

  test('本插件补丁单独应用 → 正好一个入口、零告警', () => {
    const rows = parsePatchYaml(fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8'));
    const { entries, warnings } = composeEntries([rows]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'hippocampus');
    assert.equal(entries[0].name, 'dsh-hippocampus');
    assert.deepEqual(warnings, []);
  });
});
