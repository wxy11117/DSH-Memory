import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { collectReleaseFiles } from '../../tools/release-files.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createTestDirectory(prefix = 'hp-fixture-') {
  assert.match(prefix, /^hp-[a-z-]+-$/);
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, prefix));
  let closed = false;
  // Never hand a tree containing junctions to recursive rm: some Electron
  // runtimes follow the target. Unlink entries and remove empty dirs instead.
  function removeEntry(entry) {
    assert.ok(entry === root || entry.startsWith(root + path.sep));
    const st = fs.lstatSync(entry);
    if (st.isSymbolicLink() || !st.isDirectory()) { fs.unlinkSync(entry); return; }
    for (const name of fs.readdirSync(entry)) removeEntry(path.join(entry, name));
    fs.rmdirSync(entry);
  }
  return {
    root,
    close() {
      if (closed) return;
      assert.equal(path.dirname(root), parent);
      assert.ok(path.basename(root).startsWith(prefix));
      removeEntry(root);
      closed = true;
    },
  };
}

export function createPackageFixture(prefix = 'hp-package-', source = sourceRoot) {
  const fixture = createTestDirectory(prefix);
  const packageDir = path.join(fixture.root, 'package');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    for (const rel of collectReleaseFiles(source, pkg)) {
      const dest = path.resolve(packageDir, rel);
      assert.ok(dest.startsWith(packageDir + path.sep));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(source, rel), dest);
    }
    return { ...fixture, packageDir };
  } catch (error) {
    fixture.close();
    throw error;
  }
}
