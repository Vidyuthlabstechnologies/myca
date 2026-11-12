const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const font = (file) => 'data:font/ttf;base64,' + fs.readFileSync(path.join(root, 'mobile/assets/fonts', file)).toString('base64');
const out = process.argv[2] || path.join(root, 'docs/release/assets/feature-graphic-1024x500.png');
const html = `<!doctype html><html><head><style>
@font-face { font-family: Inter; font-weight: 400; src: url(${font('Inter-Regular.ttf')}); }
@font-face { font-family: Inter; font-weight: 600; src: url(${font('Inter-SemiBold.ttf')}); }
html, body { margin: 0; width: 1024px; height: 500px; background: #FAFAF7; font-family: Inter; color: #15181B; }
.wrap { display: flex; align-items: center; gap: 48px; padding: 0 88px; height: 100%; box-sizing: border-box; }
.name { font-size: 76px; font-weight: 600; letter-spacing: -1.5px; margin: 0 0 12px; }
.line { font-size: 30px; line-height: 1.3; color: #15181B; margin: 0 0 22px; max-width: 600px; }
.tag { font-size: 22px; color: #1B5E3F; margin: 0; }
</style></head><body><div class="wrap">
<svg width="200" height="200" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#15181B"/><path d="M13 34 V15 L24 28 L35 15 V34" fill="none" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="square" stroke-linejoin="miter"/></svg>
<div><p class="name">MyCA</p><p class="line">Books, GST returns and payroll by chat.</p><p class="tag">You approve every entry and filing.</p></div>
</div></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1024, height: 500 } });
  await browser.close();
})();
