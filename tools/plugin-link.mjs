/** Replace only a package directory entry; never recursively delete a link target. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function statEntry(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function stagePluginLink(entry, target) {
  const link = path.resolve(entry);
  const destination = path.resolve(target);
  const parent = path.dirname(link);
  if (link === parent) throw new Error('不能替换文件系统根目录');
  const suffix = randomUUID();
  const staged = link + '.hp-stage-' + suffix;
  const backup = link + '.hp-backup-' + suffix;
  // These are sibling directory entries, including when node_modules is linked.
  if (path.dirname(staged) !== parent || path.dirname(backup) !== parent) throw new Error('链接备份路径越界');
  fs.mkdirSync(parent, { recursive: true });
  const previous = statEntry(link);
  let moved = false, installed = false, done = false;

  function rollback() {
    if (done) return;
    if (installed) {
      const st = statEntry(link);
      if (!st?.isSymbolicLink() || path.resolve(parent, fs.readlinkSync(link)) !== destination) {
        throw new Error('链接被其它进程改动，已保留备份，拒绝覆盖');
      }
      fs.unlinkSync(link);
      installed = false;
    }
    if (moved) { fs.renameSync(backup, link); moved = false; }
    if (statEntry(staged)) fs.unlinkSync(staged);
    done = true;
  }
  try {
    fs.symlinkSync(destination, staged, process.platform === 'win32' ? 'junction' : 'dir');
    if (previous) { fs.renameSync(link, backup); moved = true; }
    fs.renameSync(staged, link);
    installed = true;
  } catch (error) {
    try { rollback(); }
    catch (restoreError) { throw new AggregateError([error, restoreError], '建立链接失败，回退未完成；旧目录备份已保留'); }
    throw error;
  }
  return {
    rollback,
    commit() {
      if (done) return null;
      done = true;
      if (!moved) return null;
      if (previous.isSymbolicLink()) {
        // unlink removes a junction itself, even on the affected Electron build.
        try { fs.unlinkSync(backup); return null; }
        catch { return backup; } // Keep it if locked; never fall back to recursive rm.
      }
      // A real pre-existing package directory is retained for recovery.
      return backup;
    },
  };
}
