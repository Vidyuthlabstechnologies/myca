import { readFileSync } from 'node:fs';
import { releaseConfigProblems, serviceFacts } from '../cloud/src/release-config.mjs';

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : '');
const file = value('--service');
if (!file) {
  console.error('Give the deployed service with --service <file from: gcloud run services describe ... --format=json>.');
  process.exit(2);
}
const report = releaseConfigProblems({
  app: { cloudUrl: value('--cloud-url'), googleServerClientId: value('--google-client-id') },
  service: serviceFacts(JSON.parse(readFileSync(file, 'utf8'))),
  requireLive: args.includes('--require-live'),
});
for (const note of report.notes) console.log(`  - ${note}`);
for (const problem of report.problems) console.log(`::error::${problem}`);
if (report.ok) console.log('The app and the server agree.');
process.exit(report.ok ? 0 : 1);
