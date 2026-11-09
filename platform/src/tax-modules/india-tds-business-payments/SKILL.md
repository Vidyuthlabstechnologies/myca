---
name: india-tds-business-payments
description: TDS a business in India must deduct on payments to contractors (194C), professionals (194J), rent (194I) and interest (194A), the rates and yearly thresholds, the higher rate without PAN, deposit and quarterly statement due dates, interest and fees for delay, disallowance of the expense, and claiming TDS that customers deducted (Form 26AS). Use when the owner or CA asks whether to deduct TDS on a payment, at what rate, when to deposit it, what a delay costs, or why a customer paid short.
license: Proprietary. Part of MyCA.
compatibility: Designed for MyCA's tax assistant. Figures in double braces are read from MyCA's dated statutory rules for the date asked about.
metadata:
  jurisdiction: "IN"
  domain: "tds"
  version: "1.0.0"
  reviewed-on: "2026-11-09"
  review-status: "awaiting CA sign-off"
allowed-tools: tds_summary record_tds_deposit tds_return tds_review tds_certificates tds_credit_check import_26as_credits record_tds_withheld
---

# TDS on business payments

MyCA works out TDS on each bill from the dated rules, tracks deposits (`record_tds_deposit`), drafts the quarterly statement (`tds_return`) and checks customers' TDS against Form 26AS (`tds_credit_check`).

## tds-194c: TDS on payments to contractors (194C)
Keywords: 194c, contractor, contract, sub-contractor, labour, transport, job work, advertising, catering contract
Source: Income-tax Act 1961 s.194C; Income-tax Act 2025 s.393(1) Table
Rules: tds.194C.rate.individual-huf, tds.194C.rate.other-payee, tds.194C.threshold.single-sum, tds.194C.threshold.aggregate

TDS on a payment to a resident contractor is {{tds.194C.rate.individual-huf#basisPoints}} where the contractor is an individual or HUF and {{tds.194C.rate.other-payee#basisPoints}} for anyone else. No TDS is needed when a single payment is up to {{tds.194C.threshold.single-sum#amountPaise}} and the year's total to that contractor is up to {{tds.194C.threshold.aggregate#amountPaise}}.

A transporter owning ten goods carriages or fewer who gives a declaration with their PAN is paid without TDS.

## tds-194j: TDS on professional and technical fees (194J)
Keywords: 194j, professional fees, professional, technical services, consultant, chartered accountant, audit fees, legal fees, lawyer, doctor, royalty, director fees, call centre
Source: Income-tax Act 1961 s.194J; Income-tax Act 2025 s.393(1) Table
Rules: tds.194J.rate.other, tds.194J.rate.technical-film-royalty-call-centre, tds.194J.threshold.per-category, tds.194J.threshold.director-remuneration

TDS on professional fees is {{tds.194J.rate.other#basisPoints}}; on fees for technical services, royalty for films and payments to a call centre it is {{tds.194J.rate.technical-film-royalty-call-centre#basisPoints}}. No TDS is needed while the year's payments in a category to one payee stay within {{tds.194J.threshold.per-category#amountPaise}}. Remuneration to a director (other than salary) has no threshold.

## tds-194i: TDS on rent (194I)
Keywords: 194i, rent, office rent, shop rent, warehouse, lease, machinery hire, equipment hire
Source: Income-tax Act 1961 s.194I; Income-tax Act 2025 s.393(1) Table
Rules: tds.194I.rate.land-building-furniture-fittings, tds.194I.rate.plant-machinery-equipment, tds.194I.threshold

TDS on rent for land, buildings, furniture and fittings is {{tds.194I.rate.land-building-furniture-fittings#basisPoints}}; for plant, machinery and equipment it is {{tds.194I.rate.plant-machinery-equipment#basisPoints}}. No TDS is needed while rent paid to one payee stays within {{tds.194I.threshold#amountPaise}}.

## tds-194a: TDS on interest other than securities (194A)
Keywords: 194a, interest, loan interest, unsecured loan, fixed deposit, fd, interest paid
Source: Income-tax Act 1961 s.194A; Income-tax Act 2025 s.393(1) Table
Rules: tds.194A.rate, tds.194A.threshold.other-payer

A business paying interest on a loan deducts TDS at {{tds.194A.rate#basisPoints}} once the year's interest to a payee exceeds {{tds.194A.threshold.other-payer#amountPaise}}. Higher thresholds apply to banks, co-operative banks and post offices.

## no-pan: Higher TDS without PAN
Keywords: no pan, pan not given, 206aa, higher rate, 20 percent, invalid pan, inoperative pan
Source: Income-tax Act 1961 s.206AA; Income-tax Act 2025 s.397(2)
Rules: tds.no-pan.rate

When the payee does not give a valid PAN (or the PAN is inoperative because it is not linked with Aadhaar), TDS is the higher of the normal rate and {{tds.no-pan.rate#basisPoints}}.

## deposit-and-statement: When TDS is deposited and the statement filed
Keywords: deposit, due date, 7th, challan, 281, quarterly return, 26q, 24q, statement, form 16a, late fee, 234e
Source: Income-tax Act 1961 s.200(1), s.200(3), s.234E; Income-tax Rules 1962 r.30 and r.31A
Rules: due-date.tds.deposit, due-date.tds.statement

TDS deducted in a month is deposited by {{due-date.tds.deposit}}. The quarterly statement (26Q for payments other than salary, 24Q for salary) is filed by {{due-date.tds.statement}}. Form 16A goes to the payee within fifteen days of the statement's due date.

A late statement costs a fee of two hundred rupees a day under s.234E, up to the TDS amount, and a penalty under s.271H may follow after a year.

## interest-and-disallowance: Cost of not deducting or depositing TDS
Keywords: interest, 201(1a), 1 percent, 1.5 percent, disallowance, 40(a)(ia), 30 percent, expense disallowed, short deduction, not deducted
Source: Income-tax Act 1961 s.201(1), s.201(1A), s.40(a)(ia)

TDS not deducted carries interest of one per cent a month from the date it was deductible to the date it is deducted; TDS deducted but not deposited carries one and a half per cent a month from deduction to deposit.

If TDS is not deducted, or is deducted and not deposited by the return due date, thirty per cent of the expense is disallowed for that year and allowed in the year the TDS is paid.

## customer-tds-credit: TDS customers deducted from your invoices
Keywords: 26as, ais, tds credit, customer deducted, short payment, tds receivable, claim tds, form 16a received, 194o, marketplace
Source: Income-tax Act 1961 s.199; Income-tax Rules 1962 r.37BA

TDS a customer deducts from a payment to the business is the business's own tax paid. It is claimed in the return for the year in which the income is offered, from the credit shown in Form 26AS and AIS. A customer who paid short and has not reported the TDS in their statement leaves the business without the credit: ask them to file or correct their statement.

`tds_credit_check` matches the TDS recorded in MyCA against an imported Form 26AS and lists credits that are in 26AS but not in the books, and the other way round.
