const { chromium } = require('playwright');
const fs = require('fs');
const path = 'M39,68 V40 L54,58 L69,40 V68';
const mark = `<path d="${path}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>`;
const svg = (shape) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72" width="100%" height="100%">${shape}${mark}</svg>`;
const square = svg('<rect x="18" y="18" width="72" height="72" rx="14" fill="#15181B"/>');
const round = svg('<circle cx="54" cy="54" r="36" fill="#15181B"/>');
const full = svg('<rect x="0" y="0" width="108" height="108" fill="#15181B"/>');
const res = process.argv[2];
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function shot(markup, size, out, opaque) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
    await page.screenshot({ path: out, omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } });
  }
  for (const [d, s] of Object.entries(sizes)) {
    await shot(square, s, `${res}/mipmap-${d}/ic_launcher.png`, false);
    await shot(round, s, `${res}/mipmap-${d}/ic_launcher_round.png`, false);
  }
  fs.mkdirSync(process.argv[3], { recursive: true });
  await shot(full, 512, `${process.argv[3]}/play-icon-512.png`, true);
  fs.writeFileSync(`${process.argv[3]}/play-icon.svg`, full.replace('width="100%" height="100%"', 'width="512" height="512"'));
  await browser.close();
})();
