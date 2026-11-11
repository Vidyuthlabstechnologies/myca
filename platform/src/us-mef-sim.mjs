export const SANDBOX_TRIGGERS = Object.freeze({
  priorYearAgiMismatch: 99999,
  ipPinRequiredSsnSuffix: '0909',
  nameMismatchLastNamePrefix: 'ZZMISMATCH',
  duplicateDependentFirstName: 'DUPLICATE',
});

function tag(xml, name) {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  return m ? m[1] : '';
}

function tags(xml, name) {
  return [...xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`, 'g'))].map((m) => m[1]);
}

function error(ruleNumber, message, xpath, severity = 'Reject and Stop') {
  return { ruleNumber, severity, message, xpath };
}

export function simulateAcknowledgement(submission, { acceptedSsns = new Set(), receivedAt } = {}) {
  const xml = String(submission?.xml || '');
  const errors = [];
  const primary = tag(xml, 'PrimarySSN');
  const spouse = tag(xml, 'SpouseSSN');
  if (tag(xml, 'PrimaryPriorYearAGIAmt') === String(SANDBOX_TRIGGERS.priorYearAgiMismatch)) {
    errors.push(error('IND-031-04', "If the Primary Prior Year AGI is present on the return, it must match the e-File database.", '/Return/ReturnHeader/PrimaryPriorYearAGIAmt'));
  }
  if (spouse && tag(xml, 'SpousePriorYearAGIAmt') === String(SANDBOX_TRIGGERS.priorYearAgiMismatch)) {
    errors.push(error('IND-032-04', "If the Spouse Prior Year AGI is present on the return, it must match the e-File database.", '/Return/ReturnHeader/SpousePriorYearAGIAmt'));
  }
  if (primary.endsWith(SANDBOX_TRIGGERS.ipPinRequiredSsnSuffix) && !tag(xml, 'PrimaryIPPIN')) {
    errors.push(error('IND-181-01', 'The Primary Taxpayer has been issued an Identity Protection PIN, so PrimaryIPPIN must be present.', '/Return/ReturnHeader/PrimaryIPPIN'));
  }
  if (tag(xml, 'PrimaryNameControlTxt').startsWith(SANDBOX_TRIGGERS.nameMismatchLastNamePrefix.slice(0, 4)) && tag(xml, 'NameLine1Txt').includes(SANDBOX_TRIGGERS.nameMismatchLastNamePrefix)) {
    errors.push(error('R0000-500-01', 'The Primary SSN and Primary Name Control must match the e-File database.', '/Return/ReturnHeader/Filer/PrimaryNameControlTxt'));
  }
  tags(xml, 'DependentFirstNm').forEach((first, index) => {
    if (first.toUpperCase() === SANDBOX_TRIGGERS.duplicateDependentFirstName) {
      errors.push(error('IND-507-01', 'This dependent SSN has already been used as a dependent on another accepted return for this tax year.', `/Return/ReturnData/IRS1040/DependentDetail[${index + 1}]/DependentSSN`));
    }
  });
  if (acceptedSsns.has(primary)) {
    errors.push(error('R0000-902-01', 'A return with this Primary SSN has already been accepted for this tax year.', '/Return/ReturnHeader/Filer/PrimarySSN'));
  }
  const at = String(receivedAt || '');
  return {
    submissionId: submission.submissionId,
    status: errors.length ? 'Rejected' : 'Accepted',
    statusDate: at.slice(0, 10),
    acknowledgedAt: at,
    taxYear: submission.taxYear,
    errors,
  };
}
