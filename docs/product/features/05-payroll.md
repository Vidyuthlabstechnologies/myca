# Feature spec 05: Payroll

| | |
|---|---|
| Requirements | FR-PAY-1 to 4 in the [product PRD](../PRD.md) |
| Status | Employee records built (2026-10-07). Steps 1 and 2 built (2026-10-12): the monthly run, approval and postings, salary payment, payslips and salary TDS from dated payroll rules not yet signed off by the advisor CA; the PF ECR file, the ESI contribution file and the salary TDS statement (Form 138) with its review. Payouts not built. |
| Code | `platform/src/payroll.mjs`, `payroll-intent.mjs`, `employees.mjs`; rules `payroll.*` in `sprints/statutory-rules/src/rules/payroll.mjs`; app `mobile/lib/screens/payroll_screen.dart` |

## What the owner experiences

The owner adds employees once. Each month the product says payroll is ready, shows each
person's pay with deductions, and the owner approves. Salaries are paid, payslips go to
employees, and the books and the TDS return are updated without anything typed twice.
The owner's PRD describes this as payroll "like Razorpay X", inside the same product.

## User stories

1. As an owner, I add an employee with their monthly pay and joining date.
2. As an owner, I see this month's payroll and approve it in one place.
3. As an owner, I record an advance, a bonus or unpaid leave in a message.
4. As an employee, I receive a payslip.
5. As an owner, the amounts I owe for provident fund, state insurance, professional tax
   and TDS appear with my other deadlines.

## Proposed scope, in three steps

| Step | Delivers | Needs |
|---|---|---|
| 1. Compute and record | Employees, salary structure, monthly run, payslips, ledger postings, dues in the deadlines list | Payroll rules verified by the advisor CA |
| 2. Statutory files | Contribution files and the salary TDS return draft, reviewed like GST | Step 1 in use by a pilot business |
| 3. Pay from the product | Salary payouts to employee bank accounts | A regulated payout partner (PRD Q5) |

Step 1 gives the owner the main value without the product touching money. Step 3 is a
partnership and compliance project more than an engineering one.

## Employee records (built 2026-10-07)

- `employees.mjs`: an employee has a name, joining date, designation, PAN and UAN if
  given, whether they are in provident fund and state insurance, the professional tax
  state, and the tax regime they chose (left blank until stated; never assumed).
- Salary is a dated history of monthly structures in parts (Basic, HRA, any others).
  A change applies from a date; earlier months keep the salary they had, so a later
  payroll run for any month uses the structure in force then. `salaryOn(employee, date)`.
- Leaving records the last day and keeps the record and history.
- Nothing is posted to the books and no deduction is worked out; every screen and reply
  says so. No bank details are kept until payouts exist.
- Only the owner can see or change employees (`SALARIES_PRIVATE` for staff and
  accountants, through the API as well as the engine). Whether an owner can grant a CA
  access is still open.
- Tools: `add_employee`, `change_salary`, `end_employment` (previewed, proposable from
  the phone), `list_employees` (read). Chat: "add employee Ravi Kumar as store manager,
  joined 2026-09-01, salary 25000", "my employees". App: Employees on Home.

## Behaviour (step 1, built 2026-10-12)

- Employees and salary structures are stored per business in the books, so they are
  isolated and audited like everything else. An employee may now carry a sex (for the
  professional tax slab) besides the PAN, UAN, fund memberships, state and regime.
- `payroll_run` is a pure function of the employees, the month and the dated rules on
  its last day; running it twice gives the same figures and the same draft hash. A
  joiner or leaver is paid for the days employed, pro rata by calendar days.
- Provident fund: pay wages are the Basic and DA parts (the whole pay when there is no
  such part, and the row says so), capped at the `payroll.epf.wage-ceiling`; employee
  and employer shares at the `payroll.epf.*` rates with the pension share diverted
  (`payroll.epf.employer-rate`), EDLI at `payroll.edli.employer-rate`, and the
  administrative charge with its monthly minimum (`payroll.epf.admin-charge`). Figures
  are kept in paise; the EPFO's rounding to the rupee is not applied.
- State insurance: only when the full month's pay is within `payroll.esi.wage-ceiling`;
  employee and employer shares from `payroll.esi.rates`, with the employee share
  waived under the daily-wage limit in that rule. Coverage carried to the end of a
  contribution period after pay crosses the limit is not modelled.
- Professional tax: from `payroll.pt.<state code>` for the employee's state. Each rule
  carries slabs on monthly, annual (twelve times the month's full pay) or half-yearly
  (six times) pay, a February or last-month amount where the schedule has one, and for
  half-yearly states the months in which it is deducted. Encoded (2026-10-12):
  Maharashtra (by sex), Karnataka, West Bengal, Telangana, Andhra Pradesh, Gujarat,
  Madhya Pradesh, Odisha, Jharkhand, Assam, Chhattisgarh, Punjab, Tamil Nadu (the
  Greater Chennai schedule; other local bodies differ) and Kerala. All but Maharashtra
  are taken from payroll and tax publications checked against each other, with the
  official schedule not re-read, and say so in their source. An employee in any other
  state gets none, with a note. No sex recorded means the slab for men where sex
  matters.
- Salary TDS (section 192): the year's salary is estimated from the months already
  approved in MyCA, this month, and the months left (earlier months not run in MyCA are
  taken at this month's pay, and the run says so); the income-tax engine gives the
  year's tax for the employee's regime (new when none is recorded, the default in law);
  the tax still due is spread over the months left and rounded to the rupee. A payee
  without PAN pays at least the `tds.no-pan.rate` rate. The deduction is recorded as a
  TDS entry under section 192, so deposits and the TDS summary include it; the
  non-salary statement excludes it (the salary statement, Form 138, is still to build).
- Approval (`approve_payroll`, previewed, owner only, bound to the draft hash) posts
  salaries (5120) against salaries payable (2300), provident fund payable (2310), state
  insurance payable (2320), professional tax payable (2330) and TDS payable (2200), and
  the employer's contributions (5125) against the fund payables. The month is then
  frozen: later salary changes do not alter it. Approving a month also switches on the
  PF deadline for the business.
- `record_salary_payment` clears salaries payable from the bank or cash on the date
  given; the deductions stay payable until deposited. `payslip` lays out one employee's
  month; `list_payroll` lists approved months.
- Chat: "run payroll for October", "approve payroll", "paid salaries for October",
  "payslip for EMP-0001 for October", "payroll months". App: Employees has "Payroll for
  <month>", which shows each person's gross, deductions and net, the totals and the
  employer's cost, and approves or records payment after a preview.
- Every run names the rule versions used and says the CA has not reviewed them while
  any used rule carries no attestation.

## Statutory files (step 2, built 2026-10-12)

- `pf_ecr` gives the ECR 2.0 text file for an approved month: one line per provident
  fund member (UAN, name, gross, EPF, EPS and EDLI wages, the employee share, the
  pension share, the employer's EPF difference, non-contributory days, refund of
  advances, separated by `#~#`), in whole rupees as the portal expects, with the
  remittance total including EDLI and the administrative charge. A member without a UAN
  is listed by name as not uploadable.
- `esi_return` gives the state insurance monthly contribution file in the columns of the
  ESIC upload (insurance number, name, days, wages, reason code, last working day), with
  the remittance; the portal works the contributions out from the wages. A member
  without an insurance number is named. An employee may now carry an `esiNumber`.
- The salary TDS statement (Form 138, earlier 24Q) is `tds_return` with `form: 'salary'`:
  deductees under section 192 by PAN from the approved months of the quarter, with the
  challans matched in date order across both statements (one challan may cover salary
  and other TDS), and reviewed step by step with `tds_review` / `tds_review_answer`
  and `form: 'salary'` ([spec 04](04-tds.md)). Annexure II (the year's salary detail
  in the fourth quarter) is not drafted.
- Chat: "PF file for October", "ESI return for October", "salary TDS statement for Q3
  2026-27", "review salary TDS". App: the payroll screen saves the PF and ESI files for
  an approved month; Taxes lists the salary TDS statement beside the other one.
- Not built: uploading to the EPFO or ESIC portals (no API for employers), the ESI
  return deadline in the deadlines list, and Annexure II.

## Statutory care

Payroll is rule-dense and changes often: wage ceilings and contribution rates, state
professional tax slabs, the labour codes, and salary TDS under the Income-tax Act, 2025.
The existing income-tax engine (slabs, rebate, surcharge, cess, 65 golden cases) can be
reused for salary TDS. Every other rate and ceiling has to be added as a dated rule
with its citation and golden cases and signed off before this ships. This document
states no rates on purpose.

## Acceptance criteria

- The trial balance ties after a payroll run and after its payment.
- For each golden employee, every deduction matches the expected figure.
- Re-running an approved month changes nothing; a correction is a new adjustment run.
- An employee who joined or left mid-month is paid for the days worked under the stated
  proration rule.
- Staff members cannot see salaries unless the owner grants it.

## Out of scope for the first version

Attendance capture, leave management, loans, reimbursements with bills, gratuity and
full-and-final settlement, contractor payments (these are purchases with TDS, see
[spec 04](04-tds.md)).

## Open questions

- Q5 in the PRD: does the product move money?
- Remaining professional tax states (Bihar, Meghalaya, Tripura, Manipur, Mizoram,
  Nagaland, Sikkim, Puducherry) and Tamil Nadu local bodies other than Chennai need
  their schedules read before they are added; Bihar's annual amounts need its
  deduction month confirmed.
- Is salary data visible to an invited CA by default?
