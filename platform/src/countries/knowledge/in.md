---
country: IN
checked: 2026-11-11
recheck-by: 2027-04-01
attested: false
---

# India

## Summary

India is the live product: books where the tax invoice is the source of truth, GST returns
(GSTR-1 and GSTR-3B) filed through a GST Suvidha Provider, e-invoice and e-way bill through NIC,
TDS, payroll files and an AI tax assistant with an income tax return knowledge base. This file
records the country-level facts the other packs are modelled on. The statutory figures
themselves live in `sprints/statutory-rules`.

## Tax year and calendar

- The financial year runs 1 April to 31 March. Return periods and due dates come from the rule
  records and the deadline run (`platform/src/deadline-run.mjs`), never from this file.

## Filing routes

- GST returns go through a GSP. The owner's decision of 2026-11-09 is to use Quicko (Sandbox)
  and do everything possible there. The key in hand is the test key; the live key is for the
  Play release only.
  Source: `platform/src/portal-filing.mjs`, `platform/src/gstr3b-portal.mjs`
- E-invoice and e-way bill go to NIC behind the live switch and a CA approval.
  Source: `platform/src/nic-client.mjs`, `AGENTS.md` golden rule 2
- Income tax returns are prepared as JSON that the CA uploads. The ITR knowledge base covers
  ITR-1 to ITR-6 for assessment year 2025-26; add the 2026-27 schemas when the CBDT publishes
  them.
  Source: `platform/src/itr-knowledge/README.md` (ITR knowledge pull request)

## Data

- Books, documents and logs stay in India (Google Cloud `asia-south1`, Mumbai). Logs are kept
  180 days for the CERT-In directions of April 2022.
  Source: `infra/cloud/variables.tf`
- The Digital Personal Data Protection Act 2023 governs consent and notices.
  Source: `docs/compliance`

## Payments

- Monthly plans are ₹999 (Essentials), ₹1,999 (Pro), ₹4,999 (MyCA Assured, a CA reviews and
  files GST and TDS every month) and ₹5,999 (CA firm); yearly they are ₹9,999, ₹19,999, ₹49,999
  and ₹59,999. There is no free plan (settled 2026-11-10; premium prices settled 2026-11-14).
  They are software subscriptions, which Google's policy requires to go through Play billing.
  MyCA Assured is not sold until a CA team is signed.
- MyCA makes no promise to pay a customer's penalties or interest. The promise is accuracy: if a
  return MyCA filed is wrong because of MyCA's mistake, MyCA corrects and refiles it at no
  charge (settled 2026-11-14).
  Source: `mobile/lib/screens/plan_screen.dart`
  Source: `cloud/src/billing.mjs` and
  https://support.google.com/googleplay/android-developer/answer/10281818?hl=en

## Company

- ML Dynamic Solutions Private Limited holds DPIIT recognition, Udyam registration, ISO 27001,
  SOC 2 and HIPAA attestations. It has no GSTIN yet. The ISO 27001 and SOC 2 certificates are
  what Australia's DSP framework and HMRC's security questions ask for, if their scope covers
  the hosted product.

## Open questions

- A chartered accountant's sign-off on the tax modules and the newer rule records.
- Play products for the three plans, and the Play signing key's SHA-1 as an Android OAuth client.
