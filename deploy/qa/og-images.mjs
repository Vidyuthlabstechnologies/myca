import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { bahiSvg } from '../seo/bahi.mjs';
import { ogName } from '../seo/build.mjs';
import { PAGES } from '../seo/pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'public', 'assets');
const font = (weight, file) => `@font-face { font-family: Inter; font-weight: ${weight}; src: url('${pathToFileURL(join(assets, 'fonts', file)).href}'); }`;
const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card(page) {
  const india = page.edition !== 'us';
  const art = india
    ? `<div class="art">${bahiSvg({ mood: 'happy', id: 'og' })}</div>`
    : `<div class="art us"><div class="sheet"><b>${escape(page.demo.title)}</b>${page.demo.rows.map(([label, value]) => `<div class="row"><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('')}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(assets, 'bahi.css')).href}"><style>
${font(400, 'Inter-Regular.woff2')}${font(600, 'Inter-SemiBold.woff2')}
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; font-family: Inter, sans-serif; color: #15181B; background: radial-gradient(700px 400px at 100% 0%, rgba(27,94,63,.12), transparent 70%), radial-gradient(600px 360px at 0% 100%, rgba(226,169,59,.14), transparent 70%), #FAFAF7; display: grid; grid-template-columns: 1fr 420px; padding: 64px 72px; gap: 40px; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 600; letter-spacing: -.6px; }
.brand img { width: 48px; height: 48px; }
.brand .ca { color: #1B5E3F; }
.eyebrow { margin-top: 64px; font-size: 20px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #1B5E3F; }
h1 { margin-top: 16px; font-size: 58px; line-height: 1.06; letter-spacing: -1.8px; font-weight: 600; }
.foot { margin-top: 28px; font-size: 22px; color: #64686D; }
.art { align-self: center; }
.art .bahi { width: 400px; }
.sheet { background: #fff; border: 1px solid #E6E4DE; border-radius: 22px; padding: 28px; box-shadow: 0 20px 50px rgba(21,24,27,.1); font-size: 20px; }
.sheet > b { display: block; margin-bottom: 12px; font-size: 22px; }
.row { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #E6E4DE; }
.row span { color: #64686D; }
</style></head><body><div><div class="brand"><img src="${pathToFileURL(join(assets, 'logo.svg')).href}" alt=""><span>My<span class="ca">CA</span>${india ? '' : ' US'}</span></div>
<p class="eyebrow">${escape(page.eyebrow)}</p><h1>${escape(page.h1)}</h1><p class="foot">${india ? 'GST billing, books and returns for Indian businesses' : 'Prepare free on your phone. Pay only when you file.'}</p></div>${art}</body></html>`;
}

const browser = await chromium.launch();
const view = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const work = mkdtempSync(join(tmpdir(), 'myca-og-'));
mkdirSync(join(assets, 'og'), { recursive: true });
try {
  for (const page of PAGES) {
    const file = join(work, `${ogName(page.slug)}.html`);
    writeFileSync(file, card(page));
    await view.goto(pathToFileURL(file).href);
    await view.evaluate(() => document.fonts.ready);
    const out = join(assets, 'og', `${ogName(page.slug)}.png`);
    await view.screenshot({ path: out });
    process.stdout.write(`${out} ${readFileSync(out).length} bytes\n`);
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}
