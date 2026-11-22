# US state income tax returns

MyCA prepares each US state individual income tax return from the federal Form 1040. The code is
in `platform/src/countries/united-states/` and follows `COUNTRY-ENGINES.md` (manifest, engine,
dated rules). Every state with an individual income tax, and DC, is built. `us_state_tax` answers from the full return and falls back to its older estimate only when a full return cannot be worked out.

## Tools

| Tool | Access | What it does |
|---|---|---|
| `set_us_state_residency` | write | For a tax year: each state lived in or earned income in (full-year, part-year with dates, nonresident), income received there, the state's own questions, state estimated payments |
| `us_state_returns` | read | Every state return for the year, line by line, with tax, credits, payments and refund or amount due |
| `us_state_questions` | read | The questions each state asks beyond the federal return, with answers so far |
| `us_state_coverage` | read | Which states are built, their forms and what each leaves out |
| `us_state_filing_package` | read | What the e-file partner receives with the federal return (`contract: us-state-filing-v1`), with blockers |

With no residency saved, the home address state is a full-year residency and every other W-2
box 15 state is a nonresident state.

## Order of work

1. `state-context.mjs` builds one context from the federal return: filers, dependents, the
   federal lines, income by kind, itemized parts before the federal cap, W-2 state rows.
2. Nonresident and part-year states are computed first. A nonresident W-2 state under a
   reciprocal agreement with the home state (`us.state-return.reciprocity`) returns
   `reciprocal`: no tax, a return only to get back tax withheld.
3. The full-year resident state is computed last and receives `filing.otherStates`
   (tax and income of each nonresident return) for its credit for tax paid to another state.
4. The framework adds withholding (W-2 box 17 for that state), estimated and extension payments
   and refundable credits, and gives the refund or the amount due.

## A state module

`states/<xx>.mjs` exports `STATE`. A stub is `{ code, name, built: false }`. A built state:

```js
export const STATE = Object.freeze({
  code: 'IL', name: 'Illinois', built: true,
  forms: { resident: 'IL-1040', partYear: '...', nonresident: '...' },
  questions: [{ id, kind: 'amount' | 'yesno' | 'choice' | 'count' | 'text', text, help, options }],
  notCovered: ['What this return leaves out, in plain words'],
  due: (taxYear) => '2027-04-15',          // optional; April 15 of the next year by default
  compute(ctx, filing, reader) { return { form, lines, schedules, stateIncome, taxableIncome,
    taxBeforeCredits, nonrefundableCredits, otherStateCredit, otherTaxes, totalTax,
    refundableCredits, localPayments, checks, notCovered, notes }; },
});
```

- `ctx`: `taxYear`, `filingStatus`, `filers` (age at year end, blind, dependent of another),
  `dependents` (age, relationship, qualifying child flags), `federal` (the computed 1040:
  `lines`, `schedules`, `summary`), `income` (federal amounts by kind, including
  `usObligationInterest`, `taxExemptInterest`, `socialSecurityBenefits`), `itemized` (parts before
  the federal SALT cap), `w2` (per W-2 state rows), `answers` (federal interview answers).
- `filing`: `residency`, `from`, `to`, `residentDays`, `share` (days share for part-year),
  `sourced` (income of each kind taxed by this state: all of it for a full-year resident, W-2 box
  16 wages plus what the owner gave for a nonresident, days-prorated with a warning for a
  part-year resident unless given), `sourcedAgi`, `answers` (this state's questions),
  `payments`, `otherStates`.
- `reader.read(name)` reads the dated rule `us.state-return.<xx>.<name>` for the tax year and
  records it; a missing rule becomes an error check that blocks filing.
- Tax is in whole dollars. Use `bracketTax` and `rateOf` from `state-kit.mjs`; brackets are
  `[{ overCents, rateBp }]` in the rule, never in the code.
- `totalTax` is the tax after nonrefundable credits plus other taxes on the return (use tax,
  city tax on the state return). Refundable credits are listed, not netted.

## Rules

`sprints/statutory-rules/src/rules/us-state/<xx>.mjs`, one file per state, ids
`us.state-return.<xx>.<name>`, one record per tax year. Each source names the official form or
instructions and the date it was read. A figure the state has not published yet for the year
carries `provisional: true` in its value, and the filing package blocks it until replaced.
No record is edited after it is published; a change in law is a new record.

## In the app

The US app shows the state returns as their own section under the five federal steps on the 1040
hub (`us_return_status` lists no state step). `us_state_residency_screen.dart` saves
`set_us_state_residency`, starting from the home address and the W-2 box 15 states;
`us_state_questions_screen.dart` asks `us_state_questions` one at a time and saves the answers into
that state's entry; `us_state_return_screen.dart` shows `us_state_returns` with the coverage message
from `us_state_coverage`; the sign screen shows `us_state_filing_package` on the e-file partner route.
The app computes no state figure.
