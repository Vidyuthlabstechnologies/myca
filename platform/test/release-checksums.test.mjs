import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256sumsText, writeSha256Sums } from '../scripts/sha256sums.mjs';

const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA256_OF_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

test('SHA256SUMS: GNU coreutils format, two spaces, sorted by name, LF endings', () => {
  const out = sha256sumsText([
    { name: 'MyCA Setup 0.2.0.exe', bytes: Buffer.from('abc') },
    { name: 'MyCA 0.2.0.exe', bytes: Buffer.alloc(0) },
  ]);
  assert.deepEqual(out, { ok: true, text: `${SHA256_OF_EMPTY}  MyCA 0.2.0.exe\n${SHA256_OF_ABC}  MyCA Setup 0.2.0.exe\n` });
});

test('SHA256SUMS: names that sha256sum -c would misread are refused', () => {
  for (const name of ['a\nb.exe', 'a\\b.exe', 'a\rb.exe', '', '../x.exe', 'dir/x.exe']) {
    assert.deepEqual(sha256sumsText([{ name, bytes: Buffer.from('x') }]), { ok: false, error: 'UNSAFE_FILE_NAME', name });
  }
  assert.deepEqual(sha256sumsText([]), { ok: false, error: 'NO_FILES' });
});

test('SHA256SUMS: writeSha256Sums hashes only the installers in the directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-sums-'));
  writeFileSync(join(dir, 'MyCA Setup 0.2.0.exe'), 'abc');
  writeFileSync(join(dir, 'builder-debug.yml'), 'not an installer');
  const out = writeSha256Sums(dir);
  assert.deepEqual(out, { ok: true, file: join(dir, 'SHA256SUMS'), names: ['MyCA Setup 0.2.0.exe'] });
  assert.equal(readFileSync(join(dir, 'SHA256SUMS'), 'utf8'), `${SHA256_OF_ABC}  MyCA Setup 0.2.0.exe\n`);
  assert.deepEqual(writeSha256Sums(mkdtempSync(join(tmpdir(), 'myca-sums-empty-'))), { ok: false, error: 'NO_FILES' });
});
