# Country engines: the shared backend framework

Every country app (India, US, Malaysia, then the UK, Canada, the UAE, Australia) is built on the
same backend. A country adds its own tax logic in its own folder and declares what it offers in
one manifest. It never edits the central files. This is what lets several countries be built in
parallel on separate branches and merge without conflicts.

Read `COUNTRY-PACKS.md` first: the pack holds the facts about a country (currency, tax year,
prices, filing routes, data region). This page covers the code a country adds.

## Start a country

```bash
node scripts/new-country.mjs --code SG --name Singapore --currency SGD --symbol 'S$' \
  --locale en-SG --languages en,zh,ms,ta --minor-unit cents --tax-id UEN --tax-name GST \
  --time-zone Asia/Singapore
```

This writes a planned pack, an empty engine folder and a research file, and registers them:

| File | What it is |
|---|---|
| `platform/src/countries/<name>.mjs` | The pack, status `planned` |
| `platform/src/countries/<name>/manifest.mjs` | What the engine offers, as pure data |
| `platform/src/countries/<name>/engine.mjs` | The functions behind it |
| `platform/src/countries/knowledge/<code>.md` | The research file. The suite stays red until it cites a source |

Research comes first. Fill the knowledge file, then put what it finds into the pack.

## The manifest

`manifest.mjs` is pure data and imports nothing (a test enforces it). Everything else in the
system reads the manifest, so a tool is declared once.

```js
export const MANIFEST = Object.freeze({
  country: 'MY',
  capabilities: {
    'income-tax': { status: 'building', roles: { estimate: 'my_tax_estimate', profile: 'set_my_taxpayer' } },
  },
  ruleFamilies: [
    { key: 'my-income-tax', title: 'Malaysia individual income tax', prefix: 'my.income-tax.', watch: ['The Budget each October'] },
  ],
  tools: [
    { name: 'my_tax_estimate', title: 'Estimate Malaysian income tax', description: '...', access: 'read',
      schema: { type: 'object', additionalProperties: false, properties: { year: { type: 'string' } } } },
    { name: 'set_my_taxpayer', title: 'Set the taxpayer', description: '...', access: 'write',
      schema: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } } },
  ],
});
```

- `tools` are sorted by name, and each name carries the country code as one word
  (`my_tax_estimate`, `set_my_taxpayer`), so two countries never collide.
- `access` is `read` or `write`. A read tool can be queried by the app and the assistant. A write
  tool is always previewed and confirmed by the owner before it posts.
- `capabilities` say which parts of the product exist for the country, and which tool plays each
  standard role. An app screen asks for "the income tax estimate tool of this country" with
  `capabilityTool(code, 'income-tax', 'estimate')` and never hard-codes a tool name. The app gets
  the same map from `GET /v1/countries`.
- `ruleFamilies` make `rules_status` report the country's dated rules. The rules themselves live
  in `sprints/statutory-rules` with ids that start with the country code.

| Capability | Roles |
|---|---|
| `income-tax` | `profile`, `forms`, `interview`, `estimate`, `review`, `document` |
| `indirect-tax` | `summary`, `return`, `payment` |
| `e-invoice` | `issue`, `cancel`, `status` |
| `payroll` | `run`, `payslip`, `statutory-file` |
| `filing` | `submit`, `status` |
| `identity` | `validate` |

## The engine

```js
export const ENGINE = Object.freeze({
  country: 'MY',
  run: { my_tax_estimate: (state, args) => ({ ok: true, data: { ... } }) },
  preview: { set_my_taxpayer: (state, args) => ({ blockers: [], summary: '...', effects: ['...'], figures: {} }) },
  words: { my_tax_estimate: (result, money, args) => 'One or two plain sentences.' },
});
```

Every tool needs `run`. Every write tool needs `preview`. `words` is optional and turns a result
into the reply the owner reads. Keep the real logic in other files of the same folder and keep
`engine.mjs` a thin table.

A country folder may import the shared modules (`ledger.mjs`, `ca-api.mjs` for audit events,
`credential-vault.mjs`, `action-gate.mjs`, `sprint-load.mjs`, `dates.mjs`, `country.mjs`) and the
kit below. It must not import `tools.mjs`, `router.mjs`, `assistant-contract.mjs`,
`chat-confirm.mjs`, `remote-contract.mjs`, `session.mjs` or `server.mjs`.

## What picks the manifest up

| Central file | What it takes |
|---|---|
| `tools.mjs` | every tool, with its `run` |
| `assistant-contract.mjs` | the argument schema and the risk (`read_only` or `writes_books`) |
| `remote-contract.mjs` | read tools the app may query |
| `chat-confirm.mjs` | write tools that need a confirmation, and their `preview` |
| `router.mjs` | `words` |
| `cloud/src/api.mjs` | write tools the app may propose; capabilities in `GET /v1/countries` |
| `country.mjs` | a country's tools serve only that country |
| `rules-status.mjs` | rule families |

The golden rules in `AGENTS.md` still hold for a country engine: figures come from dated rules,
live government calls sit behind the live switch and an approval, every state change records an
audit event, and secrets go through the vault.

## State

A country engine adds no top-level keys to the book. It keeps its data in named slices of
`book.countryData`, which is saved and restored with the book:

```js
import { countrySlice, openCountrySlice } from '../kit/index.mjs';

const returns = countrySlice(state, 'myReturns');          // read, never writes
openCountrySlice(state, 'myReturns')[year] = draft;        // write
```

## The kit

`platform/src/countries/kit/index.mjs` holds what every tax engine needs, so each country does
not write its own:

| Function | Use |
|---|---|
| `progressiveTax(amount, bands, { rounding })`, `flatTax` | Tax over bands. Amounts are whole minor units, rates are basis points, the sum is exact and rounded once. The bands come from a dated rule, never from the code |
| `taxYearBounds(pack, label)`, `periodsBetween(from, to, months)`, `periodOf` | The dates of a tax year from the pack, and its monthly, two-monthly or quarterly filing periods |
| `moveReturn(record, to, { at, by })`, `nextStatuses`, `returnLocked` | One life cycle for every return: draft, ready, signed, submitted, accepted or rejected, with its history |
| `luhnValid`, `weightedSum`, `weightedRemainder` | Check digits for tax and identity numbers |
| `countrySlice`, `openCountrySlice` | The country's data in the book |
| `providePort`, `port`, `portOr`, `hasPort` | Ready-made packages (below) |

## Ready-made packages and providers

Use what already exists before writing it. `platform/src/countries/ready-made.mjs` lists the
packages, services and official APIs weighed for each need (identity checks, e-invoice signing,
filing, payments, bank and payroll data), with the licence, the decision and the reason.
`readyMadeFor('e-invoice', 'MY')` returns the ones that fit a country.

Rules:

- `platform/` itself stays free of runtime dependencies, so the Windows app and the test suite
  need no install. A package is installed in `cloud/`, which every country app talks to, and
  handed to the engine through a named port: `cloud/` calls `providePort('xml-signature', lib)`
  at start-up and the engine calls `port('xml-signature')`. Tests provide a small fake.
- A service is called over HTTPS behind the live switch, as `us-connectors.mjs` does.
- Copyleft or source-available code (GPL, AGPL, SSPL, BSL) is never embedded. It can be a
  cross-check in tests.
- Add a row to the catalogue when you weigh something, including what you rejected and why.

## Checks

`node scripts/countries.mjs` prints the matrix and exits 1 on any problem in a pack, a knowledge
file, a manifest, an engine or the catalogue. `platform/test/country-engines.test.mjs` covers the
contract and the kit.
