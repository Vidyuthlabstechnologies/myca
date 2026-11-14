export function checkTrn(value) {
  const raw = String(value ?? '');
  const trn = raw.replace(/[\s-]/g, '');
  if (!trn) return { valid: false, trn, why: 'Enter the 15-digit Tax Registration Number from the FTA certificate.' };
  if (!/^\d+$/.test(trn)) return { valid: false, trn, why: 'A TRN has digits only.' };
  if (trn.length !== 15) return { valid: false, trn, why: `A TRN has 15 digits; this one has ${trn.length}.` };
  if (/^0+$/.test(trn)) return { valid: false, trn, why: 'A TRN cannot be all zeros.' };
  const warnings = trn.startsWith('100') ? [] : ['FTA TRNs issued so far start with 100; check the certificate.'];
  return { valid: true, trn, tin: trn.slice(0, 10), endpoint: `0235:${trn.slice(0, 10)}`, warnings };
}

export function checkTin(value) {
  const tin = String(value ?? '').replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(tin)) return { valid: false, tin, why: 'A TIN is the first 10 digits of the TRN.' };
  return { valid: true, tin, endpoint: `0235:${tin}` };
}
