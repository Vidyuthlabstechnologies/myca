// Form names under the Income-tax Act, 2025 and the Income-tax Rules, 2026 (CBDT Notification
// 22/2026, in force 1 April 2026). Statements and certificates for the tax year 2026-27 onward
// use the new numbers; FY 2025-26 and earlier keep the 1961 Act forms. Sources: incometaxindia.gov.in
// form pages fn-130-131-132-133, fn-138, fn-140, fn-144, fn-168.

const FORMS = Object.freeze({
  salaryCertificate: { old: '16', now: '130' },
  otherCertificate: { old: '16A', now: '131' },
  salaryStatement: { old: '24Q', now: '138' },
  otherStatement: { old: '26Q', now: '140' },
  nonResidentStatement: { old: '27Q', now: '144' },
  annualStatement: { old: '26AS', now: '168' },
});

// '2026-27', 'Q1 2026-27', '2026-27 Q1' or an ISO date; true when the year falls under the 2025 Act.
export function underAct2025(period) {
  const text = String(period || '');
  const fy = text.match(/(\d{4})-\d{2}(?!-)/);
  if (fy) return Number(fy[1]) >= 2026;
  const date = text.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (date) return Number(date[1]) > 2026 || (Number(date[1]) === 2026 && Number(date[2]) >= 4);
  return false;
}

// The form's number for that year: "Form 131" from 2026-27, "Form 16A" before.
export function formNumber(kind, period) {
  const form = FORMS[kind];
  if (!form) throw new Error(`unknown form ${kind}`);
  return underAct2025(period) ? form.now : form.old;
}

// "Form 131 (was Form 16A)" from 2026-27, so users who know the old name still find it.
export function formLabel(kind, period) {
  const form = FORMS[kind];
  if (!form) throw new Error(`unknown form ${kind}`);
  return underAct2025(period) ? `Form ${form.now} (was Form ${form.old})` : `Form ${form.old}`;
}

// Accepts either numbering and gives the 1961 code the providers' FVU and TRACES APIs still take.
export function statementCode(value) {
  const text = String(value || '').trim().toUpperCase().replace(/^FORM\s*/, '');
  for (const kind of ['salaryStatement', 'otherStatement', 'nonResidentStatement']) {
    if (text === FORMS[kind].old || text === FORMS[kind].now) return FORMS[kind].old;
  }
  return '';
}

export const IT_ACT_FORMS = FORMS;
