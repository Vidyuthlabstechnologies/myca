import { X509Certificate, createHash, createPrivateKey, sign } from 'node:crypto';

const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const sha256Base64 = (bytes) => createHash('sha256').update(bytes).digest('base64');

export function distinguishedName(linesText) {
  return String(linesText || '').split('\n').filter(Boolean).reverse().join(', ');
}

export function unsignedCopy(document) {
  const copy = JSON.parse(JSON.stringify(document));
  for (const invoice of copy.Invoice || []) {
    delete invoice.UBLExtensions;
    delete invoice.Signature;
  }
  return copy;
}

export function certificateFacts(certificatePem) {
  const certificate = new X509Certificate(certificatePem);
  return {
    certificate,
    base64: certificate.raw.toString('base64'),
    digest: sha256Base64(certificate.raw),
    subject: distinguishedName(certificate.subject),
    issuer: distinguishedName(certificate.issuer),
    serial: BigInt(`0x${certificate.serialNumber}`).toString(10),
    validTo: new Date(certificate.validTo).toISOString(),
  };
}

export function signMyInvoisDocument(document, { certificatePem, privateKeyPem, passphrase, signingTime = new Date() } = {}) {
  if (!certificatePem || !privateKeyPem) return { ok: false, error: 'SIGNING_CERTIFICATE_MISSING', hint: 'MyInvois v1.1 documents are signed with the taxpayer\'s or intermediary\'s digital certificate from a Malaysian certification authority.' };
  const facts = certificateFacts(certificatePem);
  const key = createPrivateKey(passphrase ? { key: privateKeyPem, passphrase } : privateKeyPem);
  if (!facts.certificate.checkPrivateKey(key)) return { ok: false, error: 'CERTIFICATE_KEY_MISMATCH' };
  if (Date.parse(facts.validTo) < signingTime.getTime()) return { ok: false, error: 'CERTIFICATE_EXPIRED', validTo: facts.validTo };
  const unsigned = unsignedCopy(document);
  const minified = Buffer.from(JSON.stringify(unsigned), 'utf8');
  const docDigest = sha256Base64(minified);
  const signatureValue = sign('sha256', minified, key).toString('base64');
  const signedProperties = [{
    Id: 'id-xades-signed-props',
    SignedSignatureProperties: [{
      SigningTime: [{ _: signingTime.toISOString().replace(/\.\d{3}Z$/, 'Z') }],
      SigningCertificate: [{
        Cert: [{
          CertDigest: [{ DigestMethod: [{ _: '', Algorithm: SHA256 }], DigestValue: [{ _: facts.digest }] }],
          IssuerSerial: [{ X509IssuerName: [{ _: facts.issuer }], X509SerialNumber: [{ _: facts.serial }] }],
        }],
      }],
    }],
  }];
  const propsDigest = sha256Base64(Buffer.from(JSON.stringify({ Target: 'signature', SignedProperties: signedProperties }), 'utf8'));
  const signed = JSON.parse(JSON.stringify(unsigned));
  const invoice = signed.Invoice[0];
  invoice.UBLExtensions = [{
    UBLExtension: [{
      ExtensionURI: [{ _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades' }],
      ExtensionContent: [{
        UBLDocumentSignatures: [{
          SignatureInformation: [{
            ID: [{ _: 'urn:oasis:names:specification:ubl:signature:1' }],
            ReferencedSignatureID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }],
            Signature: [{
              Id: 'signature',
              Object: [{ QualifyingProperties: [{ Target: 'signature', SignedProperties: signedProperties }] }],
              KeyInfo: [{ X509Data: [{
                X509Certificate: [{ _: facts.base64 }],
                X509SubjectName: [{ _: facts.subject }],
                X509IssuerSerial: [{ X509IssuerName: [{ _: facts.issuer }], X509SerialNumber: [{ _: facts.serial }] }],
              }] }],
              SignatureValue: [{ _: signatureValue }],
              SignedInfo: [{
                SignatureMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' }],
                Reference: [
                  { Type: 'http://uri.etsi.org/01903/v1.3.2#SignedProperties', URI: '#id-xades-signed-props', DigestMethod: [{ _: '', Algorithm: SHA256 }], DigestValue: [{ _: propsDigest }] },
                  { Type: '', URI: '', DigestMethod: [{ _: '', Algorithm: SHA256 }], DigestValue: [{ _: docDigest }] },
                ],
              }],
            }],
          }],
        }],
      }],
    }],
  }];
  invoice.Signature = [{ ID: [{ _: 'urn:oasis:names:specification:ubl:signature:Invoice' }], SignatureMethod: [{ _: 'urn:oasis:names:specification:ubl:dsig:enveloped:xades' }] }];
  return { ok: true, document: signed, digests: { docDigest, propsDigest, certDigest: facts.digest }, certificate: { subject: facts.subject, issuer: facts.issuer, serial: facts.serial, validTo: facts.validTo } };
}
