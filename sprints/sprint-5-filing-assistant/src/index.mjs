import { parseSales, buildGstr1 } from './gstr1.mjs';
import { parseInward, buildGstr3b } from './gstr3b.mjs';
import { parseAis, parseForm26as, parseIncome, buildItr } from './itr.mjs';
import { parsePayments, monitorTds } from './tdsmonitor.mjs';

export function filingPrep(opts = {}) {
  const {
    salesText = '',
    inwardText = '',
    aisText = '',
    tds26Text = '',
    incomeText = '',
    paymentsText = '',
    fy = '2026-27',
    supplierState = '27',
  } = opts;

  const parsed = {
    sales: parseSales(salesText),
    inward: parseInward(inwardText),
    ais: parseAis(aisText),
    tds26: parseForm26as(tds26Text),
    income: parseIncome(incomeText),
    payments: parsePayments(paymentsText),
  };

  const errors = [];
  for (const [source, res] of Object.entries(parsed)) {
    for (const e of res.errors || []) {
      errors.push({ ...e, source });
    }
  }

  const gstr1 = buildGstr1({ sales: parsed.sales.rows, supplierState });
  const gstr3b = buildGstr3b({ sales: parsed.sales.rows, inward: parsed.inward.rows, supplierState });
  const itr = buildItr({ ais: parsed.ais.rows, tds26: parsed.tds26.rows, income: parsed.income.rows, fy });
  const tds = monitorTds({ payments: parsed.payments.rows, fy });

  const eInvoiceIssues = gstr1 ? gstr1.errors : [];
  const ok = errors.length === 0 && eInvoiceIssues.length === 0 && itr.ok && tds.length === 0;

  return {
    gstr1: gstr1 || {
      period: null,
      tables: { b2b: [], b2cl: [], b2cs: [], nilExempt: [], hsn: [] },
      totalTaxable: 0,
      errors: [],
    },
    gstr3b,
    itr,
    tds,
    errors,
    ok,
    summary: {
      period: gstr1 ? gstr1.period : null,
      totalTaxable: gstr1 ? gstr1.totalTaxable : 0,
      eInvoiceViolations: eInvoiceIssues.length,
      itrRecommended: itr.recommended,
      itrTax: itr.tax[`${itr.recommended}Total`],
      tdsCredit: itr.tdsCredit.total,
      itrPayable: itr.payable,
      tdsFlags: tds.length,
      unexplainedAis: itr.reconciliations.unexplainedAis,
    },
  };
}