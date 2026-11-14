import { parseTaxYear } from './rules.mjs';

export const FINAL_DECLARATION = Object.freeze({
  source: 'HMRC MTD Income Tax end-to-end service guide, "Agreeing to the declaration", checked 2026-11-14',
  preamble: 'Before you can submit the information displayed here in response to your notice to file from HM Revenue & Customs, you must read and agree to the following statement.',
  taxpayer: 'I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information.',
  agent: 'I confirm that my client has received a copy of all the information being filed and approved the information as being correct and complete to the best of their knowledge and belief. My client understands that they may have to pay financial penalties and face prosecution if they give false information.',
});

export const DECLARERS = Object.freeze(['taxpayer', 'agent']);

export function declarationFor(declaredBy = 'taxpayer') {
  const who = DECLARERS.includes(declaredBy) ? declaredBy : null;
  return who ? { declaredBy: who, preamble: FINAL_DECLARATION.preamble, text: FINAL_DECLARATION[who] } : null;
}

export function filingDeadline(taxYear) {
  const year = parseTaxYear(taxYear);
  return year ? `${year.start + 2}-01-31` : null;
}

export function amendmentWindowCloses(taxYear) {
  const year = parseTaxYear(taxYear);
  return year ? `${year.start + 3}-01-31` : null;
}

export function taxYearEnded(taxYear, today = new Date().toISOString().slice(0, 10)) {
  const year = parseTaxYear(taxYear);
  return Boolean(year) && today > year.to;
}

export function amendmentOpen(taxYear, today = new Date().toISOString().slice(0, 10)) {
  const closes = amendmentWindowCloses(taxYear);
  return Boolean(closes) && today <= closes;
}
