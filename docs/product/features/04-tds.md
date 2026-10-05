# Feature spec 04: TDS

| | |
|---|---|
| Requirements | FR-TDS-1 to 3 in the [product PRD](../PRD.md) |
| Status | Threshold monitor built; deduction on entries, return draft and review not built |
| Code | `sprints/statutory-rules/src/rules` (TDS rules, golden cases in `golden/tds.json`), `sprints/sprint-4-deadlines`, provider adapter for file generation |

## What the owner experiences

When the owner records a payment that needs tax deducted, the preview says so in plain
words: how much to hold back, how much to pay the supplier, and by when the held amount
goes to the government. Each quarter the TDS return is prepared and reviewed the same
way as a GST return.

## User stories

1. As an owner, I am told before I pay a supplier that I must deduct tax.
2. As an owner, I see what I owe the government in TDS this month and when it is due.
3. As an owner, I review and approve the quarterly return in chat.
4. As a supplier of the owner, I receive the certificate for what was deducted.

## Behaviour

### Monitor (built)

- Section-wise thresholds, bases and rates are dated rules. The monitor reads them on
  the payment date and each flag names the rules it used.
- Crossing an aggregate threshold during the year is flagged on the payment that
  crosses it.

### Deduct on the entry (to build)

- The purchase and expense previews show the deduction as its own line; the posting
  credits a TDS payable account and the supplier for the net.
- The supplier's PAN affects the rate. The preview asks for a missing PAN instead of
  guessing, and the rule for a payee without one is a dated rule like any other.
- Deposits to the government are recorded as payments against TDS payable, with the
  challan details.

### Return (to build)

- A quarterly draft per form from the period's deductions and challans.
- Review cards as in [spec 03](03-gst-returns.md): deductees, amounts, challans, then
  approval.
- File generation and validation are already wired to a provider behind the action
  gate; submission follows the same gate.
- Certificates to suppliers after filing, shared the same way as invoices.

## Statutory care

The Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026 and renumbered the TDS
provisions. Every section reference, rate, threshold, form number and due date used by
this feature must be a dated rule record carrying its citation under the Act in force
on the payment date, verified against the Act and signed off by the advisor CA. Nothing
in this document should be read as stating a rate or a threshold.

## Acceptance criteria

- For every golden case, the deduction equals the expected amount to the rupee as the
  law rounds it.
- A payment below every threshold produces no deduction and no flag.
- TDS payable in the ledger equals deductions less deposits at any date.
- The return draft's totals equal the ledger for the quarter.

## Out of scope

TCS, TDS on property and rent by individuals, lower-deduction certificates, corrections
to filed returns. TDS on salary is specified with [payroll](05-payroll.md).

## Open questions

- Which filing route: a provider API, or generate the file and let the owner or CA
  upload it? The second needs no onboarding and can ship first.
