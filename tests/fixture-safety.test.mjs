import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPackageFixture, createTestDirectory } from './helpers/package-fixture.mjs';

test('package fixture is an independent copy; failure cleanup preserves source files', () => {
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const before = fs.readFileSync(path.join(source, 'package.json'));
  const fixture = createPackageFixture();
  assert.throws(() => {
    try {
      assert.equal(fs.lstatSync(fixture.packageDir).isSymbolicLink(), false);
      fs.writeFileSync(path.join(fixture.packageDir, 'package.json'), 'changed only in fixture');
      throw new Error('simulated assertion failure');
    } finally { fixture.close(); }
  }, /simulated assertion failure/);
  assert.equal(fs.existsSync(fixture.root), false);
  assert.deepEqual(fs.readFileSync(path.join(source, 'package.json')), before);
  fixture.close(); // idempotent cleanup
});

test('fixture cleanup removes a junction without traversing its external target', () => {
  const target = createTestDirectory('hp-target-');
  const fixture = createTestDirectory();
  const sentinel = path.join(target.root, 'keep.txt');
  try {
    fs.writeFileSync(sentinel, 'keep source content');
    fs.symlinkSync(target.root, path.join(fixture.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    fixture.close();
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep source content');
  } finally { fixture.close(); target.close(); }
});
