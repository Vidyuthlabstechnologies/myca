import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'png');
fs.mkdirSync(out, { recursive: true });
const url = (file, query = '') => 'file://' + path.join(here, file) + query;

const jobs = [
  { file: 'brand-sheet.html', sel: '#sheet', png: 'brand-sheet.png' },
  { file: 'feature-graphic.html', sel: '#fg', png: 'feature-graphic.png' },
  { file: 'sales-sheet.html', query: '?lang=en', sel: '#sheet-en', png: 'sales-sheet-en.png' },
  { file: 'sales-sheet.html', query: '?lang=ms', sel: '#sheet-ms', png: 'sales-sheet-ms.png' },
];
for (let n = 1; n <= 10; n++) {
  for (const lang of ['en', 'ms']) {
    jobs.push({ file: 'social-posts.html', query: `?post=${n}&lang=${lang}`, sel: `#post-${n}-${lang}`, png: `social-${String(n).padStart(2, '0')}-${lang}.png` });
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 });
for (const job of jobs) {
  await page.goto(url(job.file, job.query || ''));
  await page.evaluate(() => document.fonts.ready);
  await page.locator(job.sel).screenshot({ path: path.join(out, job.png) });
  const kb = Math.round(fs.statSync(path.join(out, job.png)).size / 1024);
  console.log(job.png, kb + ' KB');
}
await browser.close();
