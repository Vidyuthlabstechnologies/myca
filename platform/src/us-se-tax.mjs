import { rules } from './sprint-load.mjs';
import { localToday } from './dates.mjs';
import { scheduleCSummary } from './us-owner-tax.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const FILING_STATUSES = ['single', 'married_joint', 'married_separate', 'head_of_household'];

export function scheduleSe(state, args = {}) {
  const year = String(args.year || localToday().slice(0, 4)).trim();
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'BAD_YEAR', year };
  const filingStatus = FILING_STATUSES.includes(String(args.filingStatus || '')) ? String(args.filingStatus) : 'single';
  const otherWages = Number.isFinite(Number(args.otherSocialSecurityWages)) && Number(args.otherSocialSecurityWages) > 0 ? round2(args.otherSocialSecurityWages) : 0;
  const se = rules.rule('us.federal.se-tax', `${year}-12-31`);
  if (!se.ok) return { ok: false, error: 'RULE_NOT_IN_FORCE', ruleId: 'us.federal.se-tax', year };
  const fica = rules.rule('us.federal.fica.social-security', `${year}-12-31`);
  if (!fica.ok) return { ok: false, error: 'RULE_NOT_IN_FORCE', ruleId: 'us.federal.fica.social-security', year };
  const scheduleC = scheduleCSummary(state, { year });
  if (!scheduleC.ok) return scheduleC;
  const v = se.record.value;
  const netProfit = scheduleC.data.netProfit;
  const netEarnings = round2(Math.max(0, netProfit) * v.netEarningsBasisPoints / 10000);
  const wageBase = fica.record.value.wageBaseCents / 100;
  const belowMinimum = netEarnings < v.minimumNetEarningsCents / 100;
  const socialSecurityRoom = round2(Math.max(0, wageBase - otherWages));
  const socialSecurityEarnings = belowMinimum ? 0 : round2(Math.min(netEarnings, socialSecurityRoom));
  const socialSecurityTax = round2(socialSecurityEarnings * v.socialSecurityBasisPoints / 10000);
  const medicareTax = belowMinimum ? 0 : round2(netEarnings * v.medicareBasisPoints / 10000);
  const threshold = (v.additionalMedicareThresholdCents[filingStatus] || v.additionalMedicareThresholdCents.single) / 100;
  const additionalMedicareTax = belowMinimum ? 0 : round2(Math.max(0, netEarnings + otherWages - threshold) * v.additionalMedicareBasisPoints / 10000);
  const selfEmploymentTax = round2(socialSecurityTax + medicareTax);
  const deduction = v.halfDeductible ? round2(selfEmploymentTax / 2) : 0;
  const unreviewed = !(se.record.attestations || []).length || !(fica.record.attestations || []).length;
  return {
    ok: true,
    data: {
      year,
      form: 'Schedule SE (Form 1040), Self-Employment Tax',
      filingStatus,
      lines: [
        { line: '2', label: 'Net profit from Schedule C', amount: netProfit },
        { line: '4a', label: `Net earnings from self-employment (${v.netEarningsBasisPoints / 100}% of line 2)`, amount: netEarnings },
        { line: '7', label: 'Social Security wage base for the year', amount: wageBase },
        { line: '8a', label: 'Social Security wages already earned elsewhere (owner-entered)', amount: otherWages },
        { line: '9', label: 'Wage base left for self-employment earnings', amount: socialSecurityRoom },
        { line: '10', label: `Social Security part (${v.socialSecurityBasisPoints / 100}% of the smaller of lines 4a and 9)`, amount: socialSecurityTax },
        { line: '11', label: `Medicare part (${v.medicareBasisPoints / 100}% of line 4a)`, amount: medicareTax },
        { line: '12', label: 'Self-employment tax', amount: selfEmploymentTax },
        { line: '13', label: 'Deduction for one half of self-employment tax (Schedule 1)', amount: deduction },
      ],
      additionalMedicareTax,
      additionalMedicareThreshold: threshold,
      netEarnings,
      selfEmploymentTax,
      deduction,
      belowMinimum,
      ruleUsed: `${se.record.id}@${se.record.effectiveFrom}; ${fica.record.id}@${fica.record.effectiveFrom}`,
      unreviewed,
      notes: [
        belowMinimum ? `Net earnings are under $${v.minimumNetEarningsCents / 100}, so no self-employment tax is due and Schedule SE need not be filed.` : 'A draft for your CPA; the figures use the long Schedule SE method on the net profit in these books.',
        'The additional Medicare tax is shown separately: it goes on Form 8959, not Schedule SE, and depends on your filing status and any wages you also earned.',
        'Church employee income, farm income and the optional methods are not covered.',
        ...(unreviewed ? ['The rates come from dated rules a US CPA has not reviewed yet.'] : []),
      ],
    },
  };
}

export function scheduleSeWords(data, money) {
  if (data.belowMinimum) return `Schedule SE ${data.year}: net earnings ${money(data.netEarnings)} are under the minimum, so no self-employment tax is due.`;
  return `Schedule SE ${data.year}: net earnings ${money(data.netEarnings)}, self-employment tax ${money(data.selfEmploymentTax)} (Social Security ${money(data.lines[5].amount)}, Medicare ${money(data.lines[6].amount)}); half, ${money(data.deduction)}, is deductible.${data.additionalMedicareTax > 0 ? ` Additional Medicare tax ${money(data.additionalMedicareTax)} on Form 8959.` : ''}${data.unreviewed ? ' A CPA has not reviewed these rules yet.' : ''}`;
}
