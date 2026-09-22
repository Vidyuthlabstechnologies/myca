import { isValidAttestation } from './validate.mjs';

function isThisFirm(attestation, firmId) {
  return attestation.role === 'firm' && typeof firmId === 'string' && firmId !== '' && attestation.firmId === firmId;
}

export function isVerifiedFor(record, firmId) {
  if (record === null || typeof record !== 'object' || !Array.isArray(record.attestations)) return false;
  const relevant = record.attestations.filter((attestation) => isValidAttestation(attestation) && (attestation.role === 'advisor' || isThisFirm(attestation, firmId)));
  if (relevant.some((attestation) => attestation.verdict === 'disputed')) return false;
  return relevant.some((attestation) => attestation.verdict === 'verified');
}
