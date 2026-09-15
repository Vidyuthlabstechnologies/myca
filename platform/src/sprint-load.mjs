import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function sprintsRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../sprints'),
    process.resourcesPath ? join(process.resourcesPath, 'sprints') : '',
    join(here, '../../../sprints'),
  ].filter(Boolean);
  const hit = candidates.find((p) => existsSync(join(p, 'sprint-1-tally-ingestion', 'src', 'index.mjs')));
  if (!hit) throw new Error(`sprints not found. looked in ${candidates.join(' | ')}`);
  return hit;
}

const root = sprintsRoot();
const load = (rel) => import(pathToFileURL(join(root, rel)).href);

export const tally = await load('sprint-1-tally-ingestion/src/index.mjs');
export const bank = await load('sprint-2-bank-ocr/src/index.mjs');
export const gst = await load('sprint-3-gst-recon/src/index.mjs');
export const gstin = await load('sprint-3-gst-recon/src/gstin.mjs');
export const deadlines = await load('sprint-4-deadlines/src/index.mjs');
export const filing = await load('sprint-5-filing-assistant/src/index.mjs');
export const audit = await load('sprint-6-defensible-audit/src/index.mjs');
