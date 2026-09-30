# public-apis directory: what is usable for MyCA

Date: 2026-09-27. Source: [public-apis/public-apis](https://github.com/public-apis/public-apis),
a community-maintained index (MIT) of roughly 1,400 free APIs across ~50 categories.

It is an index, not a guarantee: entries are contributed, the Auth/HTTPS/CORS columns are
often stale, and several listed services are dead or have since moved behind a key. Anything
below marked *verified* was called from this machine on 2026-09-27; everything else is
unverified.

## The filter

MyCA is local-first, has zero runtime dependencies, and routes every outbound call through
the action gate behind the live switch. So an API only earns a place if it passes four tests:

1. **Authority.** For anything that decides a tax figure, the source must be the Act, the
   notification, or the government portal. A third-party convenience API is never authority.
2. **Privacy.** Sending a client's GSTIN, PAN, PIN code or bank details to a free third-party
   endpoint leaks client data off the machine. That needs a reason, and the user's consent.
3. **Can it be a table instead?** Reference data that changes slowly (PIN → state, IFSC →
   bank, state codes) belongs in the repo as a dated, cited table — like `statutory-rules` —
   not as a runtime call. Offline, auditable, and it works during a pilot with no network.
4. **Gate fit.** If it must be live, it needs an `ACTION_CLASSES` entry, a mock fixture, a
   preflight and an audit record, exactly like the NIC and Sandbox calls.

Most of the directory fails test 1 or 2 outright. Four entries are worth anything to us.

## Worth using

### 1. Razorpay IFSC — bank branch lookup *(verified: keyless, HTTPS, no registration)*
`GET https://ifsc.razorpay.com/HDFC0000001` returns bank, branch, city, district, state,
MICR, SWIFT and the NEFT/RTGS/IMPS/UPI flags.

**Use for MyCA:** validating bank details on a client or vendor master, and enriching bank
statement imports (an IFSC in a narration identifies the counterparty bank). It is also a
cheap sanity check when a client's own bank account is set up.
**How:** a read-class gated action, `bank_ifsc_lookup`, opt-in — an IFSC is not especially
sensitive, but it is still the client's banking data leaving the machine. Razorpay also
publish the underlying dataset, so the better version ships it as a local table and falls
back to the API only for codes the table does not know.
**Size:** small.

### 2. PIN code → state *(verified: `api.postalpincode.in`, keyless)*
Returns post office, district, state and circle for a PIN.

**Use for MyCA:** inferring place of supply for an unregistered buyer from a delivery PIN —
exactly the gap behind H15, where POS decides CGST+SGST versus IGST. Also address validation
on invoices.
**Caution found in testing:** for PIN 500081 the response gives `"State":"Telangana"` and
`"Circle":"Andhra Pradesh"` in the same record — postal circles are not states. Anything
built on this must read the right field, and a suggested POS must be shown for confirmation,
never applied silently: getting it wrong changes the tax charged.
**How:** ship a PIN-prefix → GST state-code table in the repo (sourced from India Post /
data.gov.in, dated and cited like a rule record); no runtime call, no data leaving the
machine. Use it to *suggest* POS in the invoice preview card, with the user confirming.
**Size:** small-medium (the table build is the work).

### 3. API Setu — government KYC and business APIs *(unverified; their directory URL 404'd
for me, so treat the listing as a lead, not a fact)*
`apisetu.gov.in` is the Government of India's API platform, listed as covering KYC, business,
education and employment.

**Use for MyCA:** the legitimate long-term path for GSTIN and PAN verification alongside a
GSP/ASP. Worth a proper investigation during the GSP/ASP onboarding the owner actions already
call for — specifically whether a private company can obtain access, and on what terms.
**How:** if it materialises, it is a gated read action next to `gstin_verify`, which already
exists in `ACTION_CLASSES` pointing at the Sandbox provider.
**Size:** investigation first, not an implementation task.

### 4. data.gov.in — official open datasets *(apiKey; unverified)*
The place to source the PIN→state table above, and other reference data, from an official
publisher rather than scraping a convenience API. Use it to *build* our tables, offline.

## Deliberately not using

- **Currency/FX APIs** (Frankfurter, exchangerate.host, Fixer and the rest). Tempting and
  wrong for tax. Customs and GST valuation on imports uses the **CBIC-notified exchange
  rate**, not a market rate, and books use the actual transaction rate under AS 11 / Ind AS
  21. A market-rate API would produce plausible, unsupportable numbers. If we ever show a
  converted figure, it must be labelled as indicative only.
- **Holiday APIs** (Calendarific, caldays, and similar). Our due dates already come from
  dated rule records with holiday handling. A third-party holiday list must never be allowed
  to move a statutory deadline — the failure mode is a late filing.
- **"Tax rate" APIs** (EstimateTax, Finance Clearly). US and UK only, and in any case we do
  not take a rate from an API: rates are dated rule records with act, section and source.
- **Mutual fund NAV** (`api.mfapi.in`, *verified working*). Relevant in principle to capital
  gains in ITR, but AMFI is the authority and a client's holdings are sensitive. If we ever
  need NAV history, import AMFI's published file; do not call a third party per scheme.
- **Everything else in the directory** — animals, anime, weather, sports and so on. No fit.

## One idea worth stealing from the repo itself

Their index is a table with a fixed shape: API, description, **Auth**, **HTTPS**, **CORS**.
Terse, comparable, and it makes a bad entry obvious at a glance.

Our `provider-catalog.mjs` is richer but prose-heavy. Adding the same small set of hard
columns per provider — auth model, transport, whether it needs GSP/ASP or ERI, data that
leaves the machine, action class, and whether a mock fixture exists — would make
`provider_doctor` output far easier to read, and would force a new integration to declare
what it sends off the machine before it ships. **Size:** small, and it fits the Plan 2a
slice that already covers provider-doctor honesty.

## What this changes today

Nothing in Phase 0. H10 (chat posting entries without confirmation) is the last high
finding, and none of the above is a substitute for it. The PIN→state table is the first item
here worth building, and it belongs with the invoice preview card in the H10/4b work, where
a suggested place of supply can be shown and confirmed rather than guessed.

## Sources

- [public-apis/public-apis](https://github.com/public-apis/public-apis) — the index.
- [Razorpay IFSC](https://razorpay.com/docs/) — verified 2026-09-27 at `ifsc.razorpay.com`.
- [PostalPinCode](http://www.postalpincode.in/Api-Details) — verified at `api.postalpincode.in`.
- [API Setu](https://www.apisetu.gov.in/) — listed; directory page returned 404 on fetch.
- [data.gov.in](https://data.gov.in/) — official open data, key required.
- [mfapi.in](https://www.mfapi.in/) — verified working; not adopted.
