# ADR-0011: Country is a property of the business

Date: 2026-10-13. Status: accepted (phase U0 of the US edition).

## Context

MyCA was built for India: GST, TDS, PF and ESI, an April–March year, rupees in paise,
Indian chat phrasing. The owner wants the product usable by a business in the United
States as well. Forking the product would double the maintenance of everything that is
not country-specific (the ledger, books and tenancy, preview-then-confirm, reviews, the
action gate, audit, the hosted API, the app shell).

## Decision

A business has one country, `company.country` (`IN` or `US`), chosen when the business
is created and fixed once anything is posted. The country selects the currency and its
minor unit, the number locale, the year (financial or calendar), the rules namespace,
the tools and screens the business sees, and later the forms and integrations. The
engine, stores and app shell are shared; country-specific engines sit beside each other
and are never mixed in one business. India is the default and is unchanged by this.

Mechanics in U0: `platform/src/country.mjs` holds the country table and the shared-tool
list; `set_company` takes `country` (and an EIN for the US) only before the first
posting; `runTool` refuses a tool that does not serve the business's country with
`NOT_FOR_COUNTRY`; the snapshot lists only the tools for the country; chat and previews
format money in the business's currency; the rules registry has a `us-federal` module.

## Consequences

- Indian owners see exactly what they saw; the Indian suites are the proof.
- A US business can keep books, invoices without tax computation, expenses, reminders
  and the cash forecast from U0, and nothing that would apply Indian tax law.
- Every later US feature is gated by country and adds its own dated rules under the
  `us-federal` and `us-<state>` namespaces, attested by a US CPA.
- Multi-currency inside one business is not this decision; it is a separate feature.
