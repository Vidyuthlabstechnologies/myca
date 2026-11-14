import { createRequire } from 'node:module';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)('playwright');
const brand = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flattenScript = join(brand, 'tools', 'flatten.py');
const only = process.argv.slice(2);

async function templates() {
  const out = [];
  for (const entry of await readdir(brand, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(brand, entry.name, 'templates');
    let names = [];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.endsWith('.html')).sort()) {
      const file = join(dir, name);
      if (only.length && !only.some((o) => file.includes(o))) continue;
      out.push({ file, outDir: join(brand, entry.name, 'out', basename(name, '.html')) });
    }
  }
  return out;
}

async function open(browser, file, scale) {
  const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: 1400, height: 1000 } });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const browser = await chromium.launch();
try {
  for (const t of await templates()) {
    await mkdir(t.outDir, { recursive: true });
    const page = await open(browser, t.file, 1);
    const pdfName = await page.evaluate(() => document.body.dataset.pdf || '');
    if (pdfName) {
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      await writeFile(join(t.outDir, `${pdfName}.pdf`), pdf);
      await page.emulateMedia({ media: 'screen' });
      console.log(join(t.outDir, `${pdfName}.pdf`));
    }
    const frames = await page.$$eval('[data-frame]', (els) =>
      els.map((el) => ({ name: el.dataset.frame, scale: Number(el.dataset.scale || '1'), alpha: el.dataset.alpha === 'true' })),
    );
    const byScale = new Map([[1, page]]);
    for (const frame of frames) {
      if (!byScale.has(frame.scale)) byScale.set(frame.scale, await open(browser, t.file, frame.scale));
      const p = byScale.get(frame.scale);
      const file = join(t.outDir, `${frame.name}.png`);
      await (await p.$(`[data-frame="${frame.name}"]`)).screenshot({ path: file, omitBackground: frame.alpha });
      if (!frame.alpha) execFileSync('python3', ['-I', flattenScript, file]);
      console.log(file);
    }
    for (const p of byScale.values()) await p.close();
  }
} finally {
  await browser.close();
}
