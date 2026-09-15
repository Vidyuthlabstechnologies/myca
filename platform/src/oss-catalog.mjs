/**
 * Open-source projects scored against MyCA's vision:
 * Windows chat + invoice origin + double-entry + India GST prep + Tally/Zoho import.
 * Licenses from project pages as of 2026-09. We do not copy GPL/AGPL/O'Saasy source into the runtime.
 */
export const OSS_CATALOG = [
  {
    name: 'Hisaabo',
    url: 'https://github.com/hisaabo/hisaabo',
    license: "O'Saasy (non-compete SaaS)",
    match: 'Highest product overlap: GST invoices, GSTR-1/3B/9, 2B, ITC aging, agent tools, India-first.',
    decision: 'reference',
    why: 'Vision match is strong, but the license forbids competing hosted services and we must not copy their code. We keep a local clone for study only.',
  },
  {
    name: 'ERPNext + India Compliance',
    url: 'https://github.com/resilient-tech/india-compliance/',
    license: 'GPL-3.0',
    match: 'Deepest GST (e-invoice, e-way, GSTR) on a full ERP.',
    decision: 'reject-embed',
    why: 'Python/Frappe stack and GPL cannot be packaged inside this Electron app without relicensing MyCA.',
  },
  {
    name: 'GNUKhata',
    url: 'https://github.com/gnukhata/gkcore',
    license: 'AGPL-3.0',
    match: 'India SME books, HSN, GSTR-1 JSON export, Kerala-certified.',
    decision: 'reject-embed',
    why: 'AGPL copyleft. We reimplemented GSTR-1 JSON from the public GSTN schema instead.',
  },
  {
    name: 'TigerBeetle',
    url: 'https://tigerbeetle.com/',
    license: 'Apache-2.0',
    match: 'Debit=credit, integer amounts, append-only transfers, idempotent ids.',
    decision: 'invariants',
    why: 'Invariants are in platform/src/ledger.mjs. We did not embed the clustered database.',
  },
  {
    name: 'Akaunting / Crater / Invoice Ninja',
    url: 'https://github.com/akaunting/akaunting',
    license: 'Various (Akaunting BSL; others mixed)',
    match: 'Invoicing UX, not India GST statutory depth.',
    decision: 'reject-embed',
    why: 'Would pull a second PHP/Laravel app. Invoice origin is already in MyCA.',
  },
  {
    name: 'Tally XML HTTP interface',
    url: 'https://github.com/TanmaySawankar390/tally-dev',
    license: 'Community SDKs (do not vendor blindly)',
    match: 'Day Book / voucher pull from TallyPrime :9000.',
    decision: 'reimplement',
    why: 'We parse Tally XML locally and reuse Sprint 1 Day Book ingest. Live :9000 pull still needs Tally running.',
  },
];
