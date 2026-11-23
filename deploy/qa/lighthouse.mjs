import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));

export const LIGHTHOUSE_PAGES = Object.freeze(['/', '/gst-billing-software', '/guides', '/us', '/disclaimer']);
export const MINIMUM_SCORES = Object.freeze({ performance: 0.9, accessibility: 0.95, 'best-practices': 0.95, seo: 0.95 });

export async function runLighthouse({ base = 'http://localhost:8080', pages = LIGHTHOUSE_PAGES, minimums = MINIMUM_SCORES } = {}) {
  base = base.replace(/\/$/, '');
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH || chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  const results = [];
  try {
    for (const path of pages) {
      const runner = await lighthouse(`${base}${path}`, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: Object.keys(minimums) });
      const scores = Object.fromEntries(Object.keys(minimums).map((key) => [key, runner.lhr.categories[key]?.score ?? 0]));
      const failed = Object.entries(minimums).filter(([key, min]) => scores[key] < min).map(([key, min]) => {
        const audits = runner.lhr.categories[key].auditRefs
          .map((ref) => runner.lhr.audits[ref.id])
          .filter((audit) => audit && audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode !== 'informative' && audit.scoreDisplayMode !== 'notApplicable')
          .map((audit) => audit.id);
        return `${key} ${Math.round(scores[key] * 100)} < ${Math.round(min * 100)} (${audits.join(', ')})`;
      });
      results.push({ path, scores, failed });
    }
  } finally {
    await chrome.kill();
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv.slice(2).find((arg) => /^https?:\/\//.test(arg)) || process.env.SITE_URL || 'http://localhost:8080';
  const results = await runLighthouse({ base });
  mkdirSync(join(here, 'reports'), { recursive: true });
  writeFileSync(join(here, 'reports', 'lighthouse.json'), `${JSON.stringify(results, null, 2)}\n`);
  let failures = 0;
  for (const result of results) {
    const line = Object.entries(result.scores).map(([key, score]) => `${key} ${Math.round(score * 100)}`).join(', ');
    process.stdout.write(`${result.path}: ${line}\n`);
    for (const failure of result.failed) {
      failures += 1;
      process.stdout.write(`FAIL     ${result.path}: ${failure}\n`);
    }
  }
  process.stdout.write(failures ? `${failures} score(s) below the minimum\n` : 'All Lighthouse scores meet the minimum\n');
  process.exitCode = failures ? 1 : 0;
}
