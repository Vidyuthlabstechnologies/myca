import { localToday } from './dates.mjs';
import { countryOf } from './country.mjs';
import { deadlineRun } from './deadline-run.mjs';
import { salesTaxOverview } from './us-sales-tax.mjs';
import { estimatedTaxDates } from './us-owner-tax.mjs';
import { addReminder } from './reminders.mjs';
import { verifyChain } from './ledger.mjs';
import { rulesStatus } from './rules-status.mjs';
import { normalizeClientId } from './books.mjs';
import { dailyClose } from './daily-close.mjs';
import { registrationsOf } from './registrations.mjs';
import { filingFor } from './filings.mjs';
import { runRecurring } from './recurring.mjs';
import { runBankRules } from './bank-rules.mjs';

const LOOK_AHEAD_DAYS = 14;
const LOG_LIMIT = 60;

function plusDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function automationOf(state) {
  if (!state.automation || typeof state.automation !== 'object') state.automation = { lastRun: '', log: [] };
  if (!Array.isArray(state.automation.log)) state.automation.log = [];
  return state.automation;
}

function dueSoon(state, today, until) {
  const items = [];
  if (countryOf(state) === 'IN') {
    const clientId = normalizeClientId(state.activeClientId);
    const run = deadlineRun(state, { asOfDate: today });
    for (const row of run.deadlines || []) {
      if (row.clientId !== clientId || row.filed || row.level === 'nothing_due') continue;
      if (row.dueDate < today || row.dueDate > until) continue;
      items.push({ key: `filing:${row.returnType}:${row.period}`, due: row.dueDate, text: `${row.returnLabel || row.returnType} for ${row.period} is due` });
    }
    const extra = registrationsOf(state, { includeRetired: false }).filter((reg) => reg.kind !== 'principal');
    for (const reg of extra) {
      for (const row of run.deadlines || []) {
        if (row.clientId !== clientId || row.level === 'nothing_due' || !/^GSTR-(1|3B)$/.test(row.returnType)) continue;
        if (row.dueDate < today || row.dueDate > until) continue;
        if (filingFor(state, row.returnType, row.period, reg.gstin)) continue;
        items.push({ key: `filing:${row.returnType}:${row.period}:${reg.gstin}`, due: row.dueDate, text: `${row.returnLabel || row.returnType} for ${row.period} is due for ${reg.label} (${reg.gstin})` });
      }
    }
  } else {
    const overview = salesTaxOverview(state);
    for (const row of overview.data.states) {
      const last = row.lastPeriod;
      if (!last || last.filed || !last.dueDate || last.dueDate < today || last.dueDate > until) continue;
      items.push({ key: `filing:SALES_TAX_${row.state}:${last.period}`, due: last.dueDate, text: `Sales tax return ${row.state} for ${last.period} is due` });
    }
    const estimated = estimatedTaxDates(state, { year: today.slice(0, 4) });
    if (estimated.ok) {
      for (const item of estimated.data.installments) {
        if (item.paid || item.dueDate < today || item.dueDate > until) continue;
        items.push({ key: `estimated-tax:${item.period}`, due: item.dueDate, text: `Estimated tax instalment ${item.installment} is due` });
      }
    }
  }
  const month = today.slice(0, 7);
  const lastMonth = plusDays(`${month}-01`, -1).slice(0, 7);
  const employees = (state.employees || []).filter((e) => !e.leftOn).length;
  const payday = `${month}-07`;
  if (employees > 0 && payday >= today && payday <= until) {
    const run = state.payrollRuns && typeof state.payrollRuns === 'object' ? state.payrollRuns[lastMonth] : null;
    if (!run) items.push({ key: `payroll:${lastMonth}`, due: payday, text: `Approve the payroll for ${lastMonth}` });
  }
  return items;
}

function remindersFor(state, today, until) {
  const existing = new Set((state.reminders || []).map((reminder) => reminder.source).filter(Boolean));
  const added = [];
  for (const item of dueSoon(state, today, until)) {
    if (existing.has(item.key)) continue;
    const made = addReminder(state, { text: item.text, due: item.due, actorId: 'automation', today });
    if (!made.ok) continue;
    made.reminder.source = item.key;
    existing.add(item.key);
    added.push({ id: made.reminder.id, due: item.due, text: item.text });
  }
  return added;
}

function rulesCheck(state, today) {
  const status = rulesStatus(state, { asOf: today }).data;
  const attention = status.families.filter((family) => family.attention).map((family) => ({ key: family.key, title: family.title, gaps: family.gaps, ending: family.ending }));
  return { records: status.totals.records, integrity: status.integrity, attention };
}

function warningsOf(run) {
  const warnings = [];
  if (!run.chain.ok) warnings.push(`The ledger chain is broken at ${run.chain.at || 'an unknown row'} (${run.chain.error}). Restore from the last good backup.`);
  if (run.rules.integrity > 0) warnings.push(`${run.rules.integrity} statutory rule records fail their integrity check.`);
  for (const row of run.recurring?.failed || []) warnings.push(`Repeating entry ${row.id} for ${row.date} was not made (${row.error}). Fix it or stop it.`);
  for (const row of run.bankRules?.failed || []) warnings.push(`Statement line ${row.lineId} was not booked by bank rule ${row.ruleId} (${row.error}). Match it by hand.`);
  for (const family of run.rules.attention) {
    if (family.gaps.length) warnings.push(`No rule in force today for ${family.title}: ${family.gaps.join(', ')}.`);
    if (family.ending.length) warnings.push(`${family.title}: ${family.ending.map((item) => `${item.id} ends ${item.effectiveTo}`).join(', ')} with no successor recorded.`);
  }
  return warnings;
}

export function runDailyAutomation(state, args = {}) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOf || '')) ? args.asOf : localToday();
  const automation = automationOf(state);
  if (automation.lastRun === today && args.force !== true) {
    return { ok: true, data: { skipped: true, ranOn: today, run: automation.log[automation.log.length - 1] || null } };
  }
  const until = plusDays(today, LOOK_AHEAD_DAYS);
  const recurring = runRecurring(state, { asOf: today }).data;
  const bankRules = runBankRules(state, {});
  const chain = verifyChain(state.ledger);
  const run = {
    ranOn: today,
    until,
    reminders: remindersFor(state, today, until),
    chain: chain.ok ? { ok: true, rows: state.ledger.transfers.length } : { ok: false, error: chain.error, at: chain.at },
    rules: rulesCheck(state, today),
    recurring: { made: recurring.made, failed: recurring.failed },
    bankRules: { made: bankRules.made || [], failed: bankRules.failed || [] },
  };
  run.close = dailyClose(state, { asOf: today, clientId: normalizeClientId(state.activeClientId), chain }).data;
  run.warnings = warningsOf(run);
  automation.lastRun = today;
  automation.log.push(run);
  if (automation.log.length > LOG_LIMIT) automation.log.splice(0, automation.log.length - LOG_LIMIT);
  return { ok: true, data: { skipped: false, ranOn: today, run } };
}

export function automationStatus(state) {
  const automation = state.automation && typeof state.automation === 'object' ? state.automation : { lastRun: '', log: [] };
  const log = Array.isArray(automation.log) ? automation.log : [];
  const last = log[log.length - 1] || null;
  return { ok: true, data: { lastRun: automation.lastRun || '', runs: log.length, last, warnings: last ? last.warnings : [], recent: log.slice(-7).map((run) => ({ ranOn: run.ranOn, reminders: run.reminders.length, warnings: run.warnings.length, chainOk: run.chain.ok })) } };
}

export function automationWords(data) {
  if (!data.lastRun) return 'The daily checks have not run yet. They run when MyCA opens and once a day after that: reminders for what falls due in the next two weeks, a check of the ledger chain and of the dated statutory rules.';
  const last = data.last;
  const lines = [`Daily checks last ran on ${data.lastRun}: ${last.reminders.length === 0 ? 'no new reminders' : `${last.reminders.length} reminder${last.reminders.length === 1 ? '' : 's'} added`}, ledger chain ${last.chain.ok ? 'intact' : 'BROKEN'}, ${last.rules.records} statutory records checked.`];
  for (const reminder of last.reminders) lines.push(`· ${reminder.due}: ${reminder.text}`);
  for (const warning of last.warnings) lines.push(`! ${warning}`);
  if (last.close) lines.push(`Close: ${last.close.status === 'closed' ? 'nothing needs you' : `${last.close.needsYou.length} ${last.close.needsYou.length === 1 ? 'item needs' : 'items need'} you: ${last.close.needsYou.join(', ')}`}.`);
  return lines.join('\n');
}
