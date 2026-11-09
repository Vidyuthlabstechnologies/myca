---
name: india-presumptive-income
description: Presumptive taxation for small businesses and professionals in India under section 44AD (business, 6% or 8% of turnover) and 44ADA (profession, 50% of receipts), their turnover limits, who may use them, declaring lower profit, the five-year lock-in, the single advance tax instalment, and reconciling the turnover with GST returns. Use when a proprietor or CA asks whether to declare presumptive income, how much profit to show, whether books or an audit are needed, or why the ITR turnover does not match GSTR figures.
license: Proprietary. Part of MyCA.
compatibility: Designed for MyCA's tax assistant. Figures in double braces are read from MyCA's dated statutory rules for the date asked about.
metadata:
  jurisdiction: "IN"
  domain: "income-tax"
  version: "1.0.0"
  reviewed-on: "2026-11-09"
  review-status: "awaiting CA sign-off"
  learned-from: "india-tax-guru (MIT) presumptive and GST-turnover modules"
allowed-tools: tax_plan review_income_tax advance_tax books_check
---

# Presumptive income

The Income-tax Act, 2025 carries these schemes into s.58(2) for the tax year 2026-27 onward; the figures below come from MyCA's dated rules for the year asked about.

## presumptive-business: Presumptive business income (44AD)
Keywords: 44ad, presumptive, 6 percent, 8 percent, digital receipts, cash receipts, small business, turnover, itr-4, sugam, deemed profit, 58(2)
Source: Income-tax Act 1961 s.44AD(1) and provisos; Income-tax Act 2025 s.58(2) Table Sl. No. 1
Rules: income-tax.presumptive.business

An eligible business may declare profit of {{income-tax.presumptive.business#otherReceiptsRatePercent}} of turnover, or {{income-tax.presumptive.business#digitalReceiptsRatePercent}} of the part {{income-tax.presumptive.business#digitalReceiptCutoff}}. The two rates are applied to their own slices of turnover; one is not an alternative to the other.

The scheme is open to {{income-tax.presumptive.business#eligibleAssessees}} whose turnover is up to {{income-tax.presumptive.business#turnoverCapPaise}}, or {{income-tax.presumptive.business#lowCash.turnoverCapPaise}} where cash receipts are within {{income-tax.presumptive.business#lowCash.cashReceiptsMaxPercent}} of turnover. A turnover above the limit takes the business out of the scheme altogether. It is not open to {{income-tax.presumptive.business#excluded}}.

No other expense or depreciation is deducted from presumptive income, and no books need be kept for it.

## presumptive-profession: Presumptive professional income (44ADA)
Keywords: 44ada, presumptive, profession, professional, freelancer, consultant, doctor, lawyer, architect, 50 percent, gross receipts
Source: Income-tax Act 1961 s.44ADA(1); Income-tax Act 2025 s.58(2) Table Sl. No. 3
Rules: income-tax.presumptive.profession

A professional in one of the listed professions ({{income-tax.presumptive.profession#professions}}) may declare {{income-tax.presumptive.profession#ratePercent}} of gross receipts as profit, where receipts are up to {{income-tax.presumptive.profession#grossReceiptsCapPaise}}, or {{income-tax.presumptive.profession#lowCash.grossReceiptsCapPaise}} where cash receipts are within {{income-tax.presumptive.profession#lowCash.cashReceiptsMaxPercent}}. It is open to {{income-tax.presumptive.profession#eligibleAssessees}}; an HUF and an LLP cannot use it.

## lower-profit: Declaring less than the presumptive profit
Keywords: lower profit, less than 8 percent, less than 6 percent, books of account, 44aa, tax audit, 44ab, lock-in, five years, opt out, 44ad(4)
Source: Income-tax Act 1961 s.44AD(4), s.44AD(5), s.44AA(2)(iv), s.44AB(e); Income-tax Act 2025 s.58(3) and s.63
Rules: income-tax.presumptive.business, audit-threshold.tax-audit.presumptive-exemption

A business that declared presumptive profit in a year and then declares lower profit in any of the next {{income-tax.presumptive.business#lockInYears}} years cannot use the scheme for the following {{income-tax.presumptive.business#lockInYears}} years. In the year it declares lower profit, if its total income exceeds the basic exemption limit, it must keep books and have them audited.

A business that never used the scheme and simply declares its actual profit is not caught by the lock-in.

## advance-tax-presumptive: Advance tax on presumptive income
Keywords: advance tax, presumptive, 15 march, single instalment, 211, 234c
Source: Income-tax Act 1961 s.211(1)(b), s.234C(1)(b)
Rules: due-date.income-tax.advance-tax.presumptive

A taxpayer declaring presumptive income pays all of its advance tax in one instalment, by {{due-date.income-tax.advance-tax.presumptive}}, instead of four.

## gst-turnover-match: Matching ITR turnover with GST returns
Keywords: gst turnover, ais, mismatch, gstr-1, gstr-3b, turnover in itr, inclusive of gst, notice, reconcile, 26as turnover
Source: GST turnover in the Annual Information Statement is reported from GSTR-3B; CGST Act 2017 s.15 (value of supply excludes the GST charged); approach learned from india-tax-guru (MIT) gst module

The turnover in the return is the value of supplies without GST: tax collected on sales is owed to the government, not turnover. Counting the GST-inclusive figure overstates presumptive profit by the presumptive rate on the GST collected.

The Annual Information Statement shows a GST turnover taken from GSTR-3B, and a return with turnover well below it draws questions. Turnover may legitimately exceed the GST figure (exempt or non-GST supplies, sales before registration) and may fall short of it (the sale of a capital asset or a branch transfer counted in GST but not business turnover); keep the explanation ready before filing.

`review_income_tax` compares the turnover typed for the return with the year's taxable sales and output tax in MyCA's books and says which of these cases it looks like.
