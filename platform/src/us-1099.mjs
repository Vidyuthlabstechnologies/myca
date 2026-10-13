import { csvRows } from './text-safe.mjs';
import { contractorPayments } from './us-sales.mjs';
import { rules } from './sprint-load.mjs';

export function contractor1099File(state, args = {}) {
  const report = contractorPayments(state, args);
  if (!report.ok) return report;
  const d = report.data;
  const company = state.company || {};
  const due = rules.rule('us.federal.w2.due', `${d.year}-12-31`);
  const dueDate = due.ok ? `${Number(d.year) + 1}-${String(due.record.value.month).padStart(2, '0')}-${String(due.record.value.day).padStart(2, '0')}` : '';
  const payees = d.contractors.filter((row) => row.needs1099);
  const rows = payees.map((row) => ({
    recipient: row.name,
    entityType: row.entityType,
    tinLast4: row.tinLast4,
    w9Received: row.w9Received,
    nonemployeeCompensation: row.total,
    paidOnBills: row.paidOnBills,
    paidAsExpenses: row.paidAsExpenses,
  }));
  return {
    ok: true,
    data: {
      year: d.year,
      form: '1099-NEC',
      payer: { name: company.name || '', ein: company.ein || '', address: company.address || '' },
      dueDate,
      threshold: d.threshold,
      payees: rows,
      missingW9: d.missingW9,
      unreviewed: d.unreviewed || !(due.ok && (due.record.attestations || []).length),
      notes: [
        'Box 1, nonemployee compensation, is the year\'s payments recorded in MyCA to each contractor. MyCA keeps only the last four digits of a TIN; the full TIN comes from the W-9 when the form is prepared.',
        `Copy A goes to the IRS and Copy B to the payee${dueDate ? ` by ${dueDate}` : ''}; MyCA files nothing. Use this file in the IRS IRIS portal or your filing service.`,
        ...(d.missingW9.length ? [`No W-9 on file for ${d.missingW9.join(', ')}; request it before preparing their form.`] : []),
        ...(d.unreviewed ? ['The threshold and due date come from dated rules a US CPA has not reviewed yet.'] : []),
      ],
      fileName: `1099NEC_${(company.ein || 'EIN').replace(/[^0-9A-Za-z-]/g, '')}_${d.year}.csv`,
      csv: csvRows([
        ['tax_year', 'payer_name', 'payer_ein', 'recipient_name', 'entity_type', 'tin_last4', 'w9_received', 'box1_nonemployee_compensation'],
        ...rows.map((row) => [d.year, company.name || '', company.ein || '', row.recipient, row.entityType, row.tinLast4, row.w9Received ? 'yes' : 'no', row.nonemployeeCompensation]),
      ]),
    },
  };
}

export function file1099Words(data, money) {
  if (!data.payees.length) return `No contractor reached the 1099-NEC threshold of ${money(data.threshold)} in ${data.year}, so there is no form to prepare.`;
  const lines = [`1099-NEC data for ${data.year}: ${data.payees.length === 1 ? '1 payee' : `${data.payees.length} payees`}${data.dueDate ? `, due ${data.dueDate}` : ''}.`];
  for (const row of data.payees) lines.push(`· ${row.recipient}${row.tinLast4 ? ` (TIN ending ${row.tinLast4})` : ''}: ${money(row.nonemployeeCompensation)}${row.w9Received ? '' : ' — W-9 missing'}`);
  lines.push(`Saved as ${data.fileName}. ${data.notes[0]}`);
  return lines.join('\n');
}
