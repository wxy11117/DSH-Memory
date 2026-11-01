import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stagePluginLink } from '../tools/plugin-link.mjs';
import { createTestDirectory } from './helpers/package-fixture.mjs';

function fixture(t) {
  const f = createTestDirectory('hp-link-');
  t.after(() => f.close());
  const old = path.join(f.root, 'old-source'), next = path.join(f.root, 'new-source');
  for (const dir of [old, next]) {
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'keep.txt'), path.basename(dir));
  }
  return { old, next, link: path.join(f.root, 'node_modules', 'dsh-hippocampus') };
}
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

test('upgrading a junction preserves old and new source contents', t => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.link));
  fs.symlinkSync(f.old, f.link, linkType);
  const change = stagePluginLink(f.link, f.next);
  assert.equal(change.commit(), null);
  assert.equal(fs.realpathSync(f.link), fs.realpathSync(f.next));
  assert.equal(fs.readFileSync(path.join(f.old, 'keep.txt'), 'utf8'), 'old-source');
  assert.equal(fs.readFileSync(path.join(f.next, 'keep.txt'), 'utf8'), 'new-source');
});

test('a pre-existing real package directory is retained as a sibling backup', t => {
  const f = fixture(t);
  fs.mkdirSync(f.link, { recursive: true });
  fs.writeFileSync(path.join(f.link, 'keep.txt'), 'installed package');
  fs.symlinkSync(f.old, path.join(f.link, 'nested-link'), linkType);
  const backup = stagePluginLink(f.link, f.next).commit();
  assert.equal(path.dirname(backup), path.dirname(f.link));
  assert.equal(fs.readFileSync(path.join(backup, 'keep.txt'), 'utf8'), 'installed package');
  assert.equal(fs.readFileSync(path.join(f.old, 'keep.txt'), 'utf8'), 'old-source');
});

test('failed registration can roll the link back without touching either package', t => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.link));
  fs.symlinkSync(f.old, f.link, linkType);
  const change = stagePluginLink(f.link, f.next);
  change.rollback();
  assert.equal(fs.realpathSync(f.link), fs.realpathSync(f.old));
  assert.deepEqual(fs.readdirSync(path.dirname(f.link)), ['dsh-hippocampus']);
  assert.equal(fs.readFileSync(path.join(f.next, 'keep.txt'), 'utf8'), 'new-source');
});

test('failure while swapping restores the old link and removes only the staged link', t => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(f.link));
  fs.symlinkSync(f.old, f.link, linkType);
  const rename = fs.renameSync.bind(fs);
  const mock = t.mock.method(fs, 'renameSync', (from, to) => {
    if (from.includes('.hp-stage-') && to === f.link) throw new Error('simulated rename failure');
    return rename(from, to);
  });
  try { assert.throws(() => stagePluginLink(f.link, f.next), /simulated rename failure/); }
  finally { mock.mock.restore(); }
  assert.equal(fs.realpathSync(f.link), fs.realpathSync(f.old));
  assert.deepEqual(fs.readdirSync(path.dirname(f.link)), ['dsh-hippocampus']);
  assert.equal(fs.readFileSync(path.join(f.old, 'keep.txt'), 'utf8'), 'old-source');
});
