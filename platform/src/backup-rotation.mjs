import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { localToday } from './dates.mjs';

export const BACKUP_DIR = 'backups';
export const KEEP_DAILY = 14;

const DAILY = /^state-(\d{4}-\d{2}-\d{2})\.json$/;

function sha256Of(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function backupDirOf(statePath) {
  return join(dirname(statePath), BACKUP_DIR);
}

function dailyPath(statePath, day) {
  return join(backupDirOf(statePath), `state-${day}.json`);
}

function sumPath(path) {
  return `${path}.sha256`;
}

function writeThenRename(target, text) {
  const tempPath = join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tempPath, text, 'utf8');
    renameSync(tempPath, target);
  } catch (err) {
    try { unlinkSync(tempPath); } catch {}
    throw err;
  }
}

export function listBackups(statePath) {
  const dir = backupDirOf(statePath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => DAILY.test(name))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const day = DAILY.exec(name)[1];
      let verified = false;
      let bytes = 0;
      try {
        const text = readFileSync(path, 'utf8');
        bytes = Buffer.byteLength(text, 'utf8');
        const recorded = existsSync(sumPath(path)) ? readFileSync(sumPath(path), 'utf8').trim() : '';
        verified = recorded !== '' && recorded === sha256Of(text);
      } catch {
        verified = false;
      }
      return { day, path, bytes, verified };
    });
}

export function rotateBackups(statePath, text, { today = localToday(), keep = KEEP_DAILY } = {}) {
  const dir = backupDirOf(statePath);
  mkdirSync(dir, { recursive: true });
  const target = dailyPath(statePath, today);
  let written = false;
  if (!existsSync(target)) {
    writeThenRename(target, text);
    writeThenRename(sumPath(target), `${sha256Of(text)}\n`);
    written = true;
  }
  const kept = readdirSync(dir).filter((name) => DAILY.test(name)).sort().map((name) => ({ day: DAILY.exec(name)[1], path: join(dir, name) }));
  const removed = [];
  for (const old of kept.slice(0, Math.max(0, kept.length - keep))) {
    try { unlinkSync(old.path); } catch {}
    try { unlinkSync(sumPath(old.path)); } catch {}
    removed.push(old.day);
  }
  return { written, path: target, removed, kept: kept.length - removed.length };
}

export function latestGoodBackup(statePath) {
  const backups = listBackups(statePath).filter((backup) => backup.verified);
  for (const backup of backups.reverse()) {
    try {
      const text = readFileSync(backup.path, 'utf8');
      JSON.parse(text);
      return { ...backup, text };
    } catch {
      continue;
    }
  }
  return null;
}

export function setAsideCorruptFile(statePath, stamp = Date.now()) {
  if (!existsSync(statePath)) return '';
  const aside = `${statePath}.corrupt-${stamp}`;
  renameSync(statePath, aside);
  return aside;
}

export function backupSummary(statePath) {
  const backups = listBackups(statePath);
  const last = backups[backups.length - 1] || null;
  return { count: backups.length, verified: backups.filter((backup) => backup.verified).length, latest: last ? { day: last.day, bytes: last.bytes, verified: last.verified } : null };
}
