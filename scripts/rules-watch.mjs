import { createState } from '../platform/src/store.mjs';
import { rulesStatus } from '../platform/src/rules-status.mjs';

const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(process.argv[2] || '')) ? process.argv[2] : new Date().toISOString().slice(0, 10);
const problems = [];
const lines = [`Statutory rules as of ${asOf}`, ''];

for (const country of ['IN', 'US']) {
  const state = createState();
  state.company = { ...state.company, country };
  const { data } = rulesStatus(state, { asOf, country });
  lines.push(`${country}: ${data.totals.records} records, ${data.totals.attested} attested, integrity problems ${data.integrity}`);
  if (data.integrity > 0) problems.push(`${country}: ${data.integrity} rule records fail the registry integrity check`);
  for (const family of data.families) {
    const flags = [];
    if (family.gaps.length) flags.push(`no rule in force for ${family.gaps.join(', ')}`);
    if (family.ending.length) flags.push(`ending with no successor: ${family.ending.map((item) => `${item.id} on ${item.effectiveTo}`).join(', ')}`);
    lines.push(`  ${flags.length ? '!!' : 'ok'} ${family.title}: ${family.inForce} in force${family.coveredUntil ? `, covered until ${family.coveredUntil}` : ''}${flags.length ? ` — ${flags.join('; ')}` : ''}`);
    for (const flag of flags) problems.push(`${country} ${family.title}: ${flag}`);
  }
  lines.push('');
}

lines.push(problems.length ? `${problems.length} problem${problems.length === 1 ? '' : 's'} need a person (see docs/product/RULES-CURRENCY.md):` : 'No gaps and nothing ending within ninety days.');
for (const problem of problems) lines.push(`- ${problem}`);
process.stdout.write(`${lines.join('\n')}\n`);
process.exit(problems.length ? 1 : 0);
