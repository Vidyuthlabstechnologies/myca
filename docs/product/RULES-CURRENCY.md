# Keeping the statutory rules current

| | |
|---|---|
| Version | 1.0, 13 October 2026 |
| Applies to | Every figure under `sprints/statutory-rules/src/rules/` for India and the United States |
| Related | [ADR-0002](../architecture/decisions/0002-statutory-values-are-dated-rules.md), `rules_status` tool, the partner CA firm's validation page (`docs/partner/architecture-review.html`) |

## 1. The rule

MyCA never computes a statutory figure from anything but a dated rule record. A record
has an id, a value, the dates it is in force, the act and section, the source it was read
from, and the attestations it has collected. A change in law is a **new record** with new
dates; nothing is edited and nothing is deleted. A date outside every record's window
fails closed (`RULE_NOT_IN_FORCE`), so a missing update shows up as a refusal, never as
a stale number.

Every figure a user sees that comes from a record with no `verified` attestation carries
the words "your CA has not reviewed yet" (or "a CPA has not reviewed yet" for a US
business). Attestation is the partner firm's job; adding records is engineering's.

## 2. What to watch, and when

| Family | Rule ids | Official source to read | When it changes |
|---|---|---|---|
| GST rates, thresholds, set-off, interest, late fee, ITC blocks, e-way bill | `gst.*` | CBIC notifications (central tax and rate), CGST Rules | After each GST Council meeting; notifications usually within two weeks |
| TDS sections, rates, thresholds, no-PAN rate | `tds.*` | Finance Act, CBDT circulars | Budget on 1 February; Finance Act by 31 March; effective 1 April |
| Income tax slabs, rebate, surcharge, cess | `income-tax.*` | Finance Act First Schedule; Income-tax Act 2025 | Same as TDS |
| Tax audit and presumptive limits | `audit-threshold.*` | Finance Act amendments to the 2025 Act ss.58 and 63 | Same as TDS |
| Return due dates, QRMP day by state, rollover | `due-date.*` | CBIC and CBDT extension notifications | Any month; check after each notification |
| Gazetted holidays | `holiday.*` | DoPT Office Memorandum for the next calendar year | Published each July; **add the next year before December** |
| Provident fund and state insurance | `payroll.epf.*`, `payroll.esi.*` | EPFO and ESIC circulars; Code on Social Security 2020 rules | Rare; check quarterly |
| Professional tax by state | `payroll.pt.<state>` | Each state's commercial tax department | State budgets in February and March; effective 1 April |
| US federal information reporting (1099-NEC threshold) | `us.federal.*` | IRS General Instructions for Certain Information Returns; the annual inflation adjustment revenue procedure | October or November each year |
| US state sales tax due dates | `us.salestax.due.<ST>` | Texas Comptroller; California CDTFA; the department of revenue of any new state | Rare; check when a state is added and each January |

## 2a. The pages are watched every night

`scripts/rules-sources.mjs` reads the official pages listed in `scripts/rules-sources.json`,
strips them to text, and compares a fingerprint with the last accepted reading in
`scripts/rules-sources.seen.json`. The nightly workflow runs it; a changed page fails the
job and the nightly issue names the page and the rule family. The watcher changes nothing:
a person reads the page, adds the dated record if the law changed, and runs the script with
`--accept` to record the new reading.

Known limit, checked on 17 October 2026: the CBDT, EPFO, ESIC and DoPT sites refuse
automated reads (HTTP 403 or no answer) and the CBIC notification page is rendered by
script, so for those families the monthly check in section 3 remains the real control;
the watcher reports them as unreadable without failing the job. The GST portal news page
and the IRS instructions are read in full.

## 3. The monthly check

1. Run `rules_status` (from chat: "rules status", or `node -e` against
   `platform/src/rules-status.mjs`). It lists, per family, how many records are in force
   today, the latest effective date, what is covered until when, any rule id with nothing
   in force, and any record ending within ninety days with no successor.
2. For each family marked "needs attention", read the official source in the table above
   and add the new dated record. Keep the previous record; set its `effectiveTo` only if
   it was open-ended and the law has replaced it.
3. Write the source line so a reader can find the text: the notification number and
   date, or the section of the Act, and say plainly when the official text was not re-read.
4. Run the statutory-rules suite and the platform suite. A golden case (`BENCHMARK.md`)
   covers each engine; add one for a new figure.
5. Send the partner firm the list of new record ids to attest.

## 4. The annual checks

| By | Do |
|---|---|
| 31 March (India) | Finance Act figures for the year from 1 April: TDS, income tax, audit limits, any GST rate change announced with the budget |
| 30 April (India) | State professional tax slabs after state budgets |
| 31 July (India) | Next year's holiday calendar from the DoPT memorandum |
| 30 November (US) | IRS inflation adjustments and the next year's information return instructions |
| 31 January (US) | State sales tax calendars for every state with a nexus record |

## 5. How a record is attested

The partner firm checks a record against the law and adds an attestation to it:

```js
attestations: [{ by: 'CA R. Sharma', role: 'firm', firmId: 'FIRM-ID', on: '2026-10-20', verdict: 'verified' }]
```

A `disputed` verdict from the same firm, or from an advisor (`role: 'advisor'`,
`firmId: null`), outranks a `verified` one, so a wrong figure can be flagged without
waiting for engineering. `isVerifiedFor(record, firmId)` is the only function that
decides whether a figure is reviewed for a given firm.

## 6. What is not automated

MyCA does not fetch law from the internet, and it does not change a figure on a
schedule. The check in section 3 is a person reading an official source and adding a
record. The `rules_status` tool only makes it visible when that has not happened.
