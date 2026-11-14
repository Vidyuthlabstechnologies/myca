#!/usr/bin/env node

import { runSmoke } from '../cloud/src/sandbox-smoke.mjs';

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const out = await runSmoke(process.env, { only });
if (args.includes('--json')) {
  console.log(JSON.stringify(out, null, 2));
} else if (out.refused) {
  console.log(out.refused);
} else {
  for (const r of out.results) console.log(`${r.status.toUpperCase().padEnd(8)} ${r.id.padEnd(18)} ${r.detail}`);
  const count = (s) => out.results.filter((r) => r.status === s).length;
  console.log(`\n${count('passed')} passed, ${count('failed')} failed, ${count('skipped')} skipped (no test keys given)`);
}
process.exit(out.ok && !out.refused ? 0 : 1);
