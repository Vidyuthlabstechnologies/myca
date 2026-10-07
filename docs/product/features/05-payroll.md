# Feature spec 05: Payroll

| | |
|---|---|
| Requirements | FR-PAY-1 to 4 in the [product PRD](../PRD.md) |
| Status | Employee records built (2026-10-07). The monthly run, payslips, postings and statutory files are not built; they wait for payroll rules signed off by the advisor CA. |
| Code | None yet. Proposed: `platform/src/payroll.mjs`, payroll rules in `sprints/statutory-rules` |

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

## Behaviour (step 1)

- Employees and salary structures are stored per business in the books, so they are
  isolated and audited like everything else.
- The monthly run is a pure function of employees, attendance adjustments and the dated
  rules for that month. Running it twice gives the same result.
- The run is a preview. Approving it posts salary expense, each deduction payable and
  net salary payable. Recording the payment clears net salary payable.
- A payslip is a document produced by the engine, shared like an invoice.
- Deductions covered: provident fund, employees' state insurance, professional tax by
  state, and TDS on salary under the old or new regime the employee chose.

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
- Which states first for professional tax?
- Is salary data visible to an invited CA by default?
