const FORMS = Object.freeze({
  salaryCertificate: { old: '16', now: '130' },
  otherCertificate: { old: '16A', now: '131' },
  salaryStatement: { old: '24Q', now: '138' },
  otherStatement: { old: '26Q', now: '140' },
  nonResidentStatement: { old: '27Q', now: '144' },
  annualStatement: { old: '26AS', now: '168' },
});

export function underAct2025(period) {
  const text = String(period || '');
  const fy = text.match(/(\d{4})-\d{2}(?!-)/);
  if (fy) return Number(fy[1]) >= 2026;
  const date = text.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (date) return Number(date[1]) > 2026 || (Number(date[1]) === 2026 && Number(date[2]) >= 4);
  return false;
}

export function formNumber(kind, period) {
  const form = FORMS[kind];
  if (!form) throw new Error(`unknown form ${kind}`);
  return underAct2025(period) ? form.now : form.old;
}

export function formLabel(kind, period) {
  const form = FORMS[kind];
  if (!form) throw new Error(`unknown form ${kind}`);
  return underAct2025(period) ? `Form ${form.now} (was Form ${form.old})` : `Form ${form.old}`;
}

export function statementCode(value) {
  const text = String(value || '').trim().toUpperCase().replace(/^FORM\s*/, '');
  for (const kind of ['salaryStatement', 'otherStatement', 'nonResidentStatement']) {
    if (text === FORMS[kind].old || text === FORMS[kind].now) return FORMS[kind].old;
  }
  return '';
}

export const IT_ACT_FORMS = FORMS;
