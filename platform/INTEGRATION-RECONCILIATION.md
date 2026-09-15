# MyCA Integration Reconciliation

## Direction

Do not rebuild provider integrations as parallel product flows. Treat external APIs as provider adapters that feed existing MyCA engines.

The Cursor-built sprint modules are product logic. Provider code should translate inputs/outputs, handle authentication/session state, persist audit evidence, and then call the existing deterministic modules.

## Sandbox by Quicko Mapping

Primary docs:

- GST overview: https://developer.sandbox.co.in/api-reference/gst/overview
- Documentation index: https://developer.sandbox.co.in/llms.txt

Sandbox covers the following useful MyCA provider surfaces:

- `REQ-CA-006`: GST taxpayer auth, return status, GSTR-1/GSTR-3B flows, GSTR-2A/2B analytics jobs, ledgers, notices, and IMS.
- `REQ-CA-007`: E-invoice auth, generate, cancel, PDF, IRN lookup, and e-way bill by IRN.
- `REQ-CA-008`: Public GSTIN search, verify, PAN-to-GSTIN lookup, filing preference, and return tracking.
- `REQ-CA-009`: Income-tax calculator surfaces that can feed ITR prep and reconciliation.
- `REQ-CA-010`: TDS/TCS analytics, report generation, FVU generation, e-file status, and Form 16/16A job flows.

## Existing Owners

- Books, invoices, purchases, ledger, and trial balance: `platform/src/invoice.mjs`, `platform/src/ledger.mjs`.
- GSTR-1 offline JSON: `platform/src/gstr1-json.mjs`.
- NIC e-invoice direct flow and payload conversion: `platform/src/govt.mjs`.
- GST reconciliation, GSTR-2B parsing, GSTR-1/3B matching, Rule 37A, and IMS: `sprints/sprint-3-gst-recon`.
- Filing prep for GSTR-1, GSTR-3B, ITR, and TDS monitoring: `sprints/sprint-5-filing-assistant`.

## Adapter Rules

- Keep live filing, signing, OTP, DSC, and production credentials outside autonomous assistant control.
- Do not modify sprint integration-owned files unless the sprint AGENTS instructions allow it.
- Do not duplicate GST reconciliation, return-prep, e-invoice payload generation, or TDS threshold logic.
- Add fixture-backed adapter tests before any live HTTP behavior.
- Preserve audit logs for every provider handoff and every CA approval.
- Use `platform/src/sandbox-adapter-contract.mjs` before implementing live Sandbox calls. It defines operation IDs, mapped owner modules, assistant-blocked operations, CA approval requirements, and secret-redaction rules.
- Never persist OTPs, passwords, API keys, client secrets, auth tokens, or raw signed payloads in adapter handoff metadata.

## Local CA API Clarification

`platform/src/ca-api.mjs` is an internal contract/test harness for the first five must-have surfaces. It is useful for readiness tests and local session plumbing, but it is not the production connector layer.
