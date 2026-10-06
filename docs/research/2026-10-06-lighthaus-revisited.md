# Lighthaus revisited: against Taxmeow as built

Date: 2026-10-06. Follows [the first teardown](2026-09-27-lighthaus-teardown.md), which
describes what Lighthaus sells, their published thesis and an inferred architecture. Read
that first; this note does not repeat it.

**Method and limits.** Public pages only: the home page, Meet Spark, and the blog
(getlighthaus.ai, read 6 October 2026). Nothing behind a login, no code, no private data.
Architecture statements are inference. Their wording is paraphrased, not copied.

## 1. What changed since 27 September

On their side, nothing material. The home page, Spark page and claims are the same: a
done-for-you accounting firm for D2C brands selling on marketplaces, with AI doing the
routine work and their accountants owning each filing. One post the first teardown did not
cite, "AI Agent vs Agentic AI" (26 August), restates the thesis: a single agent performs a
task, an agentic system works towards a goal ("keep my books right"), routine work is
automated and exceptions go to a human.

On our side, a lot. The first teardown compared them with the desktop CA-firm product. The
product is now Taxmeow (working title): an owner-first Android app with a hosted service,
measured against the owner's PRD. This note redoes the comparison on that basis.

## 2. Different businesses, overlapping customers

| | Lighthaus | Taxmeow |
|---|---|---|
| What is sold | A service: their accountants keep your books, with software inside | A product: the owner keeps the books through chat, a CA is optional |
| Customer | D2C and e-commerce brands, from small to ₹10 Cr+ a month, selling on Amazon, Flipkart, quick commerce, Shopify | Retail, B2B and service businesses run by owners who are not accountants |
| Who is accountable | Lighthaus's named accountants | The owner approves; their CA signs where law needs it |
| Channel | WhatsApp and Slack (Spark), English, Hindi, Telugu | Android app; WhatsApp only as a share target today |
| Entry offer | A free books audit, findings within a week | Bring your books across from Tally, Zoho or a bank statement |
| Economics | Service margins; the first teardown notes Bench as the warning about scaling human-heavy work | Software margins; no humans in the loop on our side |

They overlap on one segment: a D2C seller who would rather keep control and pay less than a
managed service. They do not overlap on a kirana store, a consultant or a small
manufacturer, which is most of our PRD's customer.

## 3. Their headline features against our build

Status is ours as of today (about 49% of the PRD).

| Their feature | Taxmeow today | Gap |
|---|---|---|
| Invoice from one chat message, GST-correct, sent, IRN generated, booked | Invoice by message or form with preview and confirm; PDF and share sheet; IRN client behind the action gate | IRN in the flow needs NIC credentials. We will not guess the GST rate; they say the assistant remembers it. We already offer the customer's earlier rates as one-tap choices, which gets the same speed without guessing |
| Purchase register matched to 2B continuously; defaulting vendors flagged and chased | 2B added per month; credit at risk by supplier with a reason per bill; supplier bill numbers on purchases | Fetching 2B automatically (GSP); reminders (waiting on the sender decision) |
| GST filed right, every state, five registrations in one table | Returns per period with a step-by-step review and owner approval; GSTR-1 file | One GSTIN per business. Multi-state (APOB) books are a real modelling gap; live filing needs a GSP |
| Settlement reconciliation per marketplace, to the rupee | Not built | Not in our PRD. Only matters if we target marketplace sellers |
| 194-O TDS and GST TCS reconciled against 26AS and the portal | Not built | Same as above |
| Margins by SKU and channel, books closed nightly | Dashboard: this month against last for sales, purchases, expenses; who owes you | No inventory, no SKU costing, no nightly close job. The close idea is cheap for us because entries post as they happen |
| "Can I afford it?" cash answer | Not built | A cash forecast is a figure; under ADR-0004 it must come from a deterministic engine, not the model. Needs a cash-flow tool first |
| Hindi, Telugu, voice | English only | On our not-yet list |
| Answers auditable down to the entry; Excel reports on demand | Every figure from a named tool; entries CSV for the month | We can cite entries in chat answers once the model is in (ADR-0004) |
| Escalates to an accountant | Invite a CA; exceptions queue | A "send this to my CA" action on an exception would close the loop |
| Remembers follow-ups ("remind me") | Not built | Small: a reminder list in the books, shown on Home |

## 4. What to take, in order

1. **A self-serve books check as the way in.** Their free audit is a sales tool run by
   people. We can run one by software from pieces that already exist: import the owner's
   Tally or Zoho books and their 2B, then show credit at risk, invoices the return cannot
   carry, open exceptions and the GST due dates, before any sign-up decision. This is our
   strongest response to them and needs no new engine. Proposed as the first screen after
   migration.
2. **Multiple GSTINs under one business.** Their five-state table is not marketing
   decoration; any seller using marketplace warehouses has it. Our books, returns and 2B are
   per GSTIN already in shape, so the work is a business holding several registrations and
   the stock-transfer invoice between them. This needs its own spec; it touches tenancy.
3. **Hand an exception to the CA.** One action on any exception or review step: share it
   with the invited accountant, with the entries behind it. Uses membership that exists.
4. **Remind-me follow-ups.** Owner says "remind me" against a bill, a receipt or a
   supplier; it appears on Home on the day. Deterministic, small.
5. **Cash position and a simple forecast tool.** Bank and cash balances exist; receivables
   and payables give the next 30 days. Only after this exists may the chat answer "can I
   afford it".
6. **Hindi input.** After the language model decision (PRD Q3), because rules-based parsing
   in a second language is not worth building.

Not to take: settlement reconciliation and 194-O/TCS, unless the owner decides to target
marketplace sellers. Both are large, and they are Lighthaus's home ground.

## 5. Where we are already ahead or different on purpose

- **The owner approves; nothing is filed or sent without it.** Their pitch is "you never
  touch a ledger". Ours is "you never need to, but nothing happens without you". For an
  owner who has been burnt by a CA or an accountant, that is a selling point, not a gap.
- **No guessed tax rates and no model-produced figures.** Their invoice demo has the
  assistant choose the rate. We refuse to; we show the rates this customer was charged
  before. This matters the day a rate is wrong in a notice.
- **Reasons, not just flags.** Each bill at risk says why in plain words, and a date typo
  is not reported as a supplier default.
- **Price.** A product can be sold at a fraction of a managed service. The PRD does not set a
  price yet; this comparison argues for a monthly price well under what a part-time
  accountant costs.

## 6. Questions for the owner

- Do we want marketplace sellers as a target segment? It decides whether settlement
  reconciliation and 194-O/TCS enter the PRD.
- Should the self-serve books check be free and before sign-up, as their audit is?
- Is WhatsApp as an input channel (not only a share target) in scope for the first year?

## Sources

- [Lighthaus home](https://getlighthaus.ai/), [Meet Spark](https://getlighthaus.ai/meet-spark),
  read 2026-10-06.
- [AI Agent vs Agentic AI: What Is the Difference?](https://getlighthaus.ai/blogs/ai-agent-vs-agentic-ai-what-is-the-difference),
  26 Aug 2026.
- The other posts and channels are listed in the [first teardown](2026-09-27-lighthaus-teardown.md#sources).
