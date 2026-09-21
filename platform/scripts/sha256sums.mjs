import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UNSAFE_NAME = /[\\/\r\n]|^\.\.?$/;
const INSTALLER = /\.exe$/i;

export function sha256sumsText(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { ok: false, error: 'NO_FILES' };
  for (const { name } of entries) {
    if (typeof name !== 'string' || name === '' || UNSAFE_NAME.test(name)) return { ok: false, error: 'UNSAFE_FILE_NAME', name };
  }
  const lines = [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, bytes }) => `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
  return { ok: true, text: lines.join('') };
}

export function writeSha256Sums(dir) {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && INSTALLER.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const out = sha256sumsText(names.map((name) => ({ name, bytes: readFileSync(join(dir, name)) })));
  if (!out.ok) return out;
  const file = join(dir, 'SHA256SUMS');
  writeFileSync(file, out.text);
  return { ok: true, file, names };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = writeSha256Sums(resolve(process.argv[2] || 'dist'));
  if (!out.ok) {
    console.error(`sha256sums: ${out.error}${out.name ? ` (${JSON.stringify(out.name)})` : ''}`);
    process.exit(1);
  }
  process.stdout.write(readFileSync(out.file, 'utf8'));
}
