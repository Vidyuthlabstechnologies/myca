---
id: case-study-business-return
title: Case study, filing a business return with books and GST (manual workflow)
source: case-study-workflow ("sample workflow.pdf"), case-study screenshots (7 images), case-study-gst-data ("Data 2.xlsx")
applies-to: ITR-3 (also ITR-4 and ITR-5 where books and GST exist)
---

# Case study: filing a business return with books and GST

The case is a businessperson with books of account and GST registration. A CA prepares the return in desktop filing software (Winman in the source). MyCA should automate each step.

## The manual workflow

1. **Compute and enter.** The CA prepares the computation from the books and enters it in the filing software: trading account, profit and loss account, balance sheet, other income, deductions and taxes paid.
2. **Compare with AIS.** Every Indian filing software has a comparison tool (in Winman: Online > AIS/TIS > Comparison of AIS & Computation data). It lines up each AIS figure against the computation and shows the shortfall.
3. **Balance correction.** For each difference, the CA opens the field, checks it and adjusts.
4. **Review and file.**

## What the AIS comparison screen shows

The comparison lists AIS, Computation and Shortfall columns for:

- Income: dividend; interest on savings accounts, term deposits (including KVP and NSC) and others; sale of securities and mutual fund units (listed shares and equity funds u/s 112A for LTCG, securities u/s 111A for STCG, other securities); business receipts; GST turnover.
- Expenditure: GST purchases.
- Other details: cash deposits; purchase of securities and mutual fund units.

Lessons from the example in the source:

- Interest and dividend in the computation were higher than AIS. That is acceptable (AIS is not complete), but the extra must come from the taxpayer's own statements.
- Business receipts and GST turnover were zero in AIS but present in the computation, because AIS did not carry the GST turnover. The books and GST returns are the source here.
- GST purchases appeared in AIS (about ₹82.8 lakh) but were zero in the comparison's computation column, which the tool flagged as a shortfall. Purchases in the trading account must be reconciled to GSTR-2A/2B and the purchase register.
- Cash deposits and purchases of securities appear in AIS as "other details". They are not income, but the return and the books must explain them.

## AIS as the portal shows it

- **TIS (Taxpayer Information Summary)** groups information by category (dividend, sale of securities and mutual fund units, business receipts, purchase of vehicle, purchase of securities) with two columns: "Processed by System" and "Accepted by Taxpayer / Confirmed by Source".
- **AIS detail** lists each item with part (such as TDS/TCS), information description (such as "Dividend received (Section 194)"), information source (payer name and TAN) and three amounts: reported by source, processed by system, accepted by taxpayer.

## The ITR balance sheet and P&L in the software

The balance sheet lines are: proprietor's capital, reserves and surplus, secured loans (foreign currency, rupee loans from banks and others), unsecured loans, deferred tax liability, advances, current liabilities (sundry creditors, lease liability, interest accrued), provisions (income tax, leave encashment, superannuation and gratuity, other), and on the assets side fixed assets (gross block, depreciation, capital work in progress) and investments (long-term quoted and unquoted). Total liabilities must equal total assets (ITR-3 rules A-47 to A-50).

The trading account runs from sales (sale of goods, services, other operating revenue, gross professional receipts, duties and taxes on sales) and closing stock, against opening stock, purchases net of returns and taxes, direct expenses and taxes on inputs, to gross profit. The P&L adds other income and lists expenses (advertisement, audit fee, bad debts, club expenses, commission and so on) to reach net profit.

## GST reconciliation before the return

The case's worksheet reconciles, month by month for FY 2024-25:

- **Sales:** taxable value, IGST, SGST and CGST in the books (Tally) against GSTR-1 and GSTR-3B, with a difference column for each.
- **Purchases:** the books against GSTR-3B and GSTR-2A, adjusted for debit and credit notes, with differences "GSTR-2A vs 3B" and "Tally vs GSTR-3B".

A remaining difference (in the case, about ₹55,000 of taxable purchases) must be explained before the turnover and purchases go into the return. MyCA's `gst_review`, `gstr2b_check` and turnover checks in `review_income_tax` cover this.
