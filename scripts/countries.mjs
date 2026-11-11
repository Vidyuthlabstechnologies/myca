import { PACKS, packProblems, licencesNeeded } from '../platform/src/countries/index.mjs';
import { countryKnowledge, knowledgeProblems } from '../platform/src/countries/knowledge.mjs';
import { MANIFESTS, manifestProblems, countryCapabilities, manifestFor } from '../platform/src/countries/manifests.mjs';
import { engineProblems } from '../platform/src/countries/engines.mjs';
import { readyMadeProblems } from '../platform/src/countries/ready-made.mjs';

const rows = PACKS.map((pack) => ({
  country: `${pack.code} ${pack.name}`,
  status: pack.status,
  data: pack.residency.defaultRegion || 'needs a host',
  app: pack.app.androidId,
  prices: pack.billing.plans.map((plan) => `${plan.id} ${pack.billing.currency} ${plan.price}`).join(', ') || '-',
  filing: pack.filing.map((entry) => entry.authority).join(', '),
  tools: pack.toolPolicy === 'unclaimed' ? 'all unclaimed' : String(pack.tools.length + (manifestFor(pack.code)?.tools.length || 0)),
  built: Object.entries(countryCapabilities(pack.code)).filter(([name]) => name !== 'profile').map(([name, capability]) => `${name} (${capability.status})`).join(', ') || '-',
  'still needed': licencesNeeded(pack.code).map((licence) => licence.id).join(', ') || '-',
  'knowledge checked': countryKnowledge(pack.code)?.checked || 'missing',
}));
console.table(rows);
const problems = [
  ...packProblems(),
  ...knowledgeProblems(PACKS, new Date().toISOString().slice(0, 10)),
  ...manifestProblems(MANIFESTS, PACKS.map((pack) => pack.code)),
  ...engineProblems(),
  ...readyMadeProblems(),
];
for (const line of problems) console.error(`problem: ${line}`);
process.exit(problems.length ? 1 : 0);
