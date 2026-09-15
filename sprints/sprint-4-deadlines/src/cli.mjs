import { readFileSync } from 'node:fs';
import { complianceRun, ALL_MONTHS } from './index.mjs';

function usage() {
  console.log('Usage: node src/cli.mjs --clients <csv> --docs <csv> [--holidays <csv>] [--months 2026-09,2026-10] [--as-of 2026-09-07]');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      args[flag] = true;
      continue;
    }
    args[flag] = value;
  }
  return args;
}

function readText(file, flag) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    console.error(`Cannot read ${flag} file: ${file}`);
    return null;
  }
}

const args = parseArgs(process.argv);
if (!args['--clients'] || !args['--docs']) {
  usage();
  process.exitCode = 1;
} else {
  const clientsText = readText(args['--clients'], '--clients');
  const docsText = readText(args['--docs'], '--docs');
  const holidaysText = args['--holidays'] ? readText(args['--holidays'], '--holidays') : '';
  if (clientsText === null || docsText === null || (args['--holidays'] && holidaysText === null)) {
    process.exitCode = 1;
  } else {
    const months = args['--months'] ? args['--months'].split(',').map((m) => m.trim()) : ALL_MONTHS;
    const asOfDate = args['--as-of'] || new Date().toISOString().slice(0, 10);
    const run = complianceRun({ clientsText, docsText, holidaysText }, { months, asOfDate });
    const t = run.board.totals;
    console.log(`Compliance run | as-of ${asOfDate} | months ${months.join(',')}`);
    for (const p of run.board.perClient) {
      const next = p.nextDeadline ? `${p.nextDeadline.returnType} ${p.nextDeadline.period} on ${p.nextDeadline.dueDate}` : 'none';
      console.log(`- ${p.clientId} ${p.name} | ${p.status} | next: ${next} | completeness ${p.completeness ?? '-'} | chase ${p.chaseCount}`);
    }
    console.log(`Totals: clients ${t.clients}, deadlines ${t.deadlines}, overdue ${t.overdue}, urgent ${t.urgent}, due_soon ${t.dueSoon}, on_track ${t.onTrack}, completenessAvg ${t.completenessAvg}, chase messages ${t.chaseMessages}`);
    if (run.errors.length > 0) {
      console.error(`${run.errors.length} input error(s)`);
      for (const e of run.errors.slice(0, 10)) console.error(`  [${e.code}] row ${e.row}: ${e.message}`);
      process.exitCode = 1;
    } else {
      for (const msg of run.chase) console.log(msg.message);
      if (run.board.alerts.some((a) => a.severity === 'error')) {
        for (const a of run.board.alerts.filter((a) => a.severity === 'error')) console.log(`ERROR: ${a.message}`);
      }
      if (!run.ok) {
        console.log(`Action required: ${t.overdue} overdue, ${t.urgent} urgent`);
        process.exitCode = 2;
      } else {
        console.log('All clear: no overdue or urgent deadlines');
      }
    }
  }
}