import { rules } from '../../sprint-load.mjs';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RULE_ID = 'my.payroll.cp39-text-file';

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

const digits = (value) => String(value ?? '').replace(/\D/g, '');
const clean = (value) => String(value ?? '').replace(/[\r\n\t]/g, ' ').trim();
const toSen = (value) => Math.round(Number(value || 0) * 100);

function amountOk(value) {
  return value === undefined || value === null || value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0);
}

function fit(field, value) {
  const text = String(value);
  if (field.pad === 'zero-left') return text.padStart(field.length, '0');
  return text.padEnd(field.length, ' ');
}

function line(fields, values) {
  return fields.map((field) => fit(field, values[field.key] ?? '')).join('');
}

function employerNumber(value, length) {
  const number = digits(value);
  return number && number.length <= length ? number : null;
}

function readEmployee(employee, index, layout, problems) {
  const at = `employees[${index}]`;
  const width = Object.fromEntries(layout.detail.map((field) => [field.key, field.length]));
  const name = clean(employee.name);
  const tin = digits(employee.taxNumber);
  const newIc = digits(employee.newIc);
  const oldIc = clean(employee.oldIc);
  const passport = clean(employee.passport);
  const country = clean(employee.countryCode).toUpperCase();
  const employeeNo = clean(employee.employeeNo);
  for (const [key, value] of [['pcb', employee.pcb], ['cp38', employee.cp38]]) {
    if (!amountOk(value)) problems.push({ field: `${at}.${key}`, why: 'an amount of zero or more in ringgit' });
  }
  const pcbSen = amountOk(employee.pcb) ? toSen(employee.pcb) : 0;
  const cp38Sen = amountOk(employee.cp38) ? toSen(employee.cp38) : 0;
  if (amountOk(employee.pcb) && amountOk(employee.cp38) && pcbSen === 0 && cp38Sen === 0) return { name: name || `Employee ${index + 1}`, pcbSen, cp38Sen };
  if (!name) problems.push({ field: `${at}.name`, why: 'the full name as on the identity card or passport' });
  if (name.length > width.name) problems.push({ field: `${at}.name`, why: `at most ${width.name} characters` });
  if (!tin) problems.push({ field: `${at}.taxNumber`, why: 'the tax identification number is mandatory in the CP39 file' });
  else if (tin.length > width.taxNumber) problems.push({ field: `${at}.taxNumber`, why: `at most ${width.taxNumber} digits` });
  if (newIc && newIc.length !== width.newIc) problems.push({ field: `${at}.newIc`, why: `${width.newIc} digits without dashes` });
  if (oldIc.length > width.oldIc) problems.push({ field: `${at}.oldIc`, why: `at most ${width.oldIc} characters` });
  if (passport.length > width.passport) problems.push({ field: `${at}.passport`, why: `at most ${width.passport} characters` });
  if (!newIc && !oldIc && !passport) problems.push({ field: at, why: 'give the new IC number, the old IC number or the passport number' });
  if (country && !/^[A-Z]{2}$/.test(country)) problems.push({ field: `${at}.countryCode`, why: 'two letters from LHDN\'s country code list, for a foreign employee only' });
  if (passport && !newIc && !oldIc && !country) problems.push({ field: `${at}.countryCode`, why: 'a foreign employee needs the two-letter country code' });
  if (employeeNo.length > width.employeeNo) problems.push({ field: `${at}.employeeNo`, why: `at most ${width.employeeNo} characters` });
  for (const [key, sen] of [['pcb', pcbSen], ['cp38', cp38Sen]]) {
    if (String(sen).length > width[key]) problems.push({ field: `${at}.${key}`, why: 'too large for the file' });
  }
  return { name, tin, newIc, oldIc, passport, country, employeeNo, pcbSen, cp38Sen };
}

export function malaysiaCp39(args = {}) {
  const month = MONTH.exec(String(args.month || ''));
  if (!month) return fail('BAD_MONTH', { hint: 'Give the deduction month as YYYY-MM.' });
  const found = rules.rule(RULE_ID, `${args.month}-01`);
  if (!found.ok) return fail('RULE_NOT_IN_FORCE', { ruleId: RULE_ID, hint: 'MyCA has LHDN\'s CP39 text file layout from January 2026.' });
  const layout = found.value;
  const employerWidth = layout.header.find((field) => field.key === 'employerNo').length;
  const employerNo = employerNumber(args.employerNo, employerWidth);
  if (!employerNo) return fail('EMPLOYER_NUMBER_REQUIRED', { hint: `Give the employer's E number (up to ${employerWidth} digits).` });
  const hqGiven = args.hqEmployerNo !== undefined && args.hqEmployerNo !== null && String(args.hqEmployerNo).trim() !== '';
  const hqEmployerNo = hqGiven ? employerNumber(args.hqEmployerNo, employerWidth) : employerNo;
  if (!hqEmployerNo) return fail('EMPLOYER_NUMBER_REQUIRED', { hint: `The head office employer number has up to ${employerWidth} digits.` });
  const list = Array.isArray(args.employees) ? args.employees : [];
  if (!list.length) return fail('NO_EMPLOYEES', { hint: 'List the employees with their PCB for the month.' });
  const problems = [];
  const read = list.map((employee, index) => readEmployee(employee && typeof employee === 'object' ? employee : {}, index, layout, problems));
  if (problems.length) return fail('BAD_INPUT', { problems, hint: 'Fix the employees listed.' });
  const rows = read.filter((row) => row.pcbSen > 0 || row.cp38Sen > 0);
  const leftOut = read.filter((row) => row.pcbSen === 0 && row.cp38Sen === 0).map((row) => row.name);
  if (!rows.length) return fail('NOTHING_TO_REMIT', { hint: 'No employee has PCB or CP38 for this month, so there is no CP39 file to send.' });
  const totalPcbSen = rows.reduce((sum, row) => sum + row.pcbSen, 0);
  const totalCp38Sen = rows.reduce((sum, row) => sum + row.cp38Sen, 0);
  const pcbRecords = rows.filter((row) => row.pcbSen > 0).length;
  const cp38Records = rows.filter((row) => row.cp38Sen > 0).length;
  const header = line(layout.header, { recordType: 'H', hqEmployerNo, employerNo, year: month[1], month: month[2], totalPcb: totalPcbSen, pcbRecords, totalCp38: totalCp38Sen, cp38Records });
  const details = rows.map((row) => line(layout.detail, { recordType: 'D', taxNumber: row.tin, name: row.name, oldIc: row.oldIc, newIc: row.newIc, passport: row.passport, countryCode: row.country, pcb: row.pcbSen, cp38: row.cp38Sen, employeeNo: row.employeeNo }));
  if (header.length !== layout.headerLength || details.some((detail) => detail.length !== layout.detailLength)) return fail('LAYOUT_MISMATCH', { hint: 'A total is too large for the CP39 layout.' });
  const year = Number(month[1]);
  const next = Number(month[2]) === 12 ? `${year + 1}-01` : `${year}-${String(Number(month[2]) + 1).padStart(2, '0')}`;
  return {
    ok: true,
    data: {
      month: args.month,
      fileName: `${employerNo.padStart(employerWidth, '0')}${month[2]}_${month[1]}.txt`,
      content: [header, ...details].join('\r\n') + '\r\n',
      records: rows.length,
      totals: { pcb: totalPcbSen / 100, pcbRecords, cp38: totalCp38Sen / 100, cp38Records },
      leftOut,
      dueBy: `${next}-15`,
      notes: [
        'Upload the file in e-PCB Plus on MyTax, or through your bank\'s PCB payment page, and pay the total by the due date.',
        'LHDN\'s specification does not say how lines end; this file ends each line with a carriage return and line feed, as payroll files usually do.',
        ...(leftOut.length ? [`Left out, with no PCB or CP38 this month: ${leftOut.join(', ')}.`] : []),
      ],
      rulesUsed: [{ id: found.record.id, effectiveFrom: found.record.effectiveFrom, unreviewed: !(found.record.attestations || []).length }],
    },
  };
}
