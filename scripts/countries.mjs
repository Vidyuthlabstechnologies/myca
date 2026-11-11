import { PACKS, packProblems } from '../platform/src/countries/index.mjs';

const rows = PACKS.map((pack) => ({
  country: `${pack.code} ${pack.name}`,
  status: pack.status,
  data: pack.residency.defaultRegion || 'needs a host',
  app: pack.app.androidId,
  prices: pack.billing.plans.map((plan) => `${plan.id} ${pack.billing.currency} ${plan.price}`).join(', ') || '-',
  filing: pack.filing.map((entry) => entry.authority).join(', '),
  tools: pack.toolPolicy === 'unclaimed' ? 'all unclaimed' : String(pack.tools.length),
}));
console.table(rows);
const problems = packProblems();
for (const line of problems) console.error(`problem: ${line}`);
process.exit(problems.length ? 1 : 0);
