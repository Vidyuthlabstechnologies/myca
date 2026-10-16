import { readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_AGE_MS = 10 * 60 * 1000;
const dir = tmpdir();
let removed = 0;
for (const name of readdirSync(dir)) {
  if (!/^myca-/.test(name)) continue;
  const path = join(dir, name);
  try {
    if (Date.now() - statSync(path).mtimeMs < MAX_AGE_MS && process.argv[2] !== '--all') continue;
    rmSync(path, { recursive: true, force: true });
    removed += 1;
  } catch {}
}
console.log(`removed ${removed} test temp folder${removed === 1 ? '' : 's'}`);
