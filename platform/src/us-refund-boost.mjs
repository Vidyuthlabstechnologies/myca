import { computeForm1040, SUPPORTED_YEARS } from './us-1040.mjs';
import { engineInput } from './us-return.mjs';
import { localToday } from './dates.mjs';

const TRIAL = 1000;

const hasForm = (input, kind) => (input.forms || []).some((form) => form.kind === kind);
const earns = (input) => hasForm(input, 'W-2') || hasForm(input, '1099-NEC') || (input.businesses || []).length > 0;
const selfEmployed = (input) => hasForm(input, '1099-NEC') || (input.businesses || []).length > 0;
const empty = (value) => value === undefined || value === null || value === '' || Number(value) === 0;

const AMOUNT_CHECKS = Object.freeze([
  { id: 'ira', answer: 'iraDeduction', title: 'Traditional IRA contribution', question: 'Did you, or could you before the filing deadline, put money in a traditional IRA?', note: 'Contributions made up to the April filing deadline count for this year. The deduction shrinks when you or your spouse have a workplace retirement plan and income is high.', applies: earns },
  { id: 'hsa', answer: 'hsaOwnContributions', trial: (input) => (input.answers?.hsaCoverage ? {} : { hsaCoverage: 'self-only' }), title: 'Health savings account', question: 'Did you put money of your own (not through payroll) into an HSA?', note: 'Only with a high-deductible health plan, up to the yearly HSA limit less what your employer put in. Payroll HSA money is already left out of W-2 wages.', applies: (input) => input.answers?.hsaCoverage !== 'none' && empty(input.answers?.hsaDeduction) },
  { id: 'student-loan', answer: 'studentLoanInterest', title: 'Student loan interest', question: 'Did you pay interest on a student loan?', note: 'Your lender sends Form 1098-E when interest is $600 or more, but smaller amounts count too.', applies: (input) => !hasForm(input, '1098-E') },
  { id: 'educator', answer: 'educatorExpenses', title: 'Educator expenses', question: 'Are you a K-12 teacher, aide or counselor who bought classroom supplies?', note: 'For at least 900 hours a school year in a K-12 school.', applies: earns },
  { id: 'se-health', answer: 'selfEmployedHealthInsurance', title: 'Self-employed health insurance', question: 'Did you pay your own health, dental or long-term care insurance while self-employed?', note: 'Not for months you could join an employer\'s plan, yours or your spouse\'s.', applies: selfEmployed },
  { id: 'se-retirement', answer: 'retirementPlanDeduction', title: 'SEP-IRA or solo 401(k)', question: 'Did you put money into a SEP-IRA, SIMPLE or solo 401(k) for your business?', note: 'A SEP-IRA can be opened and funded up to the filing deadline, including extensions.', applies: selfEmployed },
  { id: 'tips', answer: 'qualifiedTips', title: 'No tax on tips', question: 'Did you receive tips in a job where tipping is customary?', note: 'Tips reported on your W-2 or to your employer qualify; the deduction phases out at higher incomes.', applies: (input) => hasForm(input, 'W-2') },
  { id: 'overtime', answer: 'qualifiedOvertime', title: 'No tax on overtime', question: 'Were you paid overtime at time-and-a-half under the FLSA?', note: 'Only the half-time premium above your regular rate counts.', applies: (input) => hasForm(input, 'W-2') },
  { id: 'car-loan', answer: 'carLoanInterest', title: 'Car loan interest', question: 'Did you pay interest on a loan for a new personal car assembled in the US, bought after 2024?', note: 'The loan must be secured by the car and taken out for personal use.', applies: () => true },
  { id: 'charity', answer: 'charityCash', title: 'Cash gifts to charity', question: 'Did you give money to a US charity?', note: 'Keep a receipt; gifts of $250 or more need a written acknowledgment from the charity.', applies: () => true },
  { id: 'medical', answer: 'medicalExpenses', title: 'Medical and dental costs', question: 'Did you pay large medical or dental bills not covered by insurance?', note: 'Only the part above 7.5% of your AGI counts, and only when you itemize.', applies: () => true },
]);

function planningYear(value) {
  const year = String(value || '').trim() || localToday().slice(0, 4);
  return SUPPORTED_YEARS.includes(year) ? year : null;
}

function net(result) {
  return result.ok ? Number(result.data.summary.refund || 0) - Number(result.data.summary.owed || 0) : null;
}

function withAnswers(input, change) {
  return { ...input, answers: { ...input.answers, ...change } };
}

export function usRefundBoost(state, args = {}) {
  const taxYear = planningYear(args.taxYear);
  if (!taxYear) return { ok: false, error: 'TAX_YEAR_NOT_SUPPORTED', supported: SUPPORTED_YEARS };
  const ret = state.usReturns?.[taxYear];
  if (!ret || !ret.filingStatus) return { ok: false, error: 'US_RETURN_NOT_STARTED', taxYear, hint: `Start the ${taxYear} return first; the booster checks the return you have.` };
  const input = engineInput(state, ret);
  const base = computeForm1040(input, taxYear);
  if (!base.ok) return base;
  const baseNet = net(base);
  const opportunities = [];
  let checked = 0;
  for (const item of AMOUNT_CHECKS) {
    if (!empty(input.answers?.[item.answer]) || !item.applies(input)) continue;
    checked += 1;
    const trial = net(computeForm1040(withAnswers(input, { [item.answer]: TRIAL, ...(item.trial ? item.trial(input) : {}) }), taxYear));
    const gain = trial === null ? 0 : Math.round(trial - baseNet);
    if (gain > 0) opportunities.push({ id: item.id, title: item.title, question: item.question, note: item.note, answer: item.answer, kind: 'amount', per1000: gain });
  }
  if (input.answers?.itemize === 'no') {
    checked += 1;
    const trial = net(computeForm1040(withAnswers(input, { itemize: undefined }), taxYear));
    const gain = trial === null ? 0 : Math.round(trial - baseNet);
    if (gain > 0) opportunities.push({ id: 'itemize', title: 'Itemize instead of the standard deduction', question: 'Let MyCA pick the larger of itemized and standard deductions?', note: 'You chose the standard deduction, but your itemized deductions are larger.', answer: 'itemize', kind: 'switch', gain });
  }
  if (ret.filingStatus === 'single' && (input.dependents || []).length > 0) {
    checked += 1;
    const trial = net(computeForm1040({ ...input, filingStatus: 'hoh' }, taxYear));
    const gain = trial === null ? 0 : Math.round(trial - baseNet);
    if (gain > 0) opportunities.push({ id: 'head-of-household', title: 'Head of household filing status', question: 'Were you unmarried and did you pay more than half the cost of keeping up a home for a qualifying person who lived with you?', note: 'Head of household has a larger standard deduction and wider brackets than single.', answer: 'filingStatus', kind: 'switch', gain });
  }
  opportunities.sort((a, b) => (b.gain ?? b.per1000) - (a.gain ?? a.per1000));
  return {
    ok: true,
    data: {
      taxYear,
      refund: base.data.summary.refund,
      owed: base.data.summary.owed,
      checked,
      opportunities,
      why: 'Each amount is worked out by running your return again with the change, using the same rules; you must qualify and have the records.',
    },
  };
}

export function usRefundBoostWords(data) {
  const usd = (value) => `$${Math.round(Number(value || 0)).toLocaleString('en-US')}`;
  if (!data.opportunities.length) return `MyCA checked ${data.checked} common deductions and credits for ${data.taxYear} and found nothing more you are leaving out.`;
  const lines = data.opportunities.map((item) => (item.kind === 'amount' ? `· ${item.title}: every $1,000 adds about ${usd(item.per1000)}. ${item.question}` : `· ${item.title}: about ${usd(item.gain)} more. ${item.question}`));
  return `${data.opportunities.length} way${data.opportunities.length === 1 ? '' : 's'} to raise your ${data.taxYear} refund:\n${lines.join('\n')}`;
}
