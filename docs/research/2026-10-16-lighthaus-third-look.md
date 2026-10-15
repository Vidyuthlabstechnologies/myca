# Lighthaus, third look: ahead, behind, or different

Date: 2026-10-16. Follows the [teardown of 27 September](2026-09-27-lighthaus-teardown.md)
and the [revisited note of 6 October](2026-10-06-lighthaus-revisited.md). Read those for
what Lighthaus sells and their published thesis; this note only records what changed and
answers one question: measured against what is built in this repository today, are we
ahead of them or behind?

**Method and limits.** Public pages only: the home page, Meet Spark and the blog at
getlighthaus.ai, read 16 October 2026, plus the founders' LinkedIn. Nothing behind a
login. They publish no pricing, customer count, funding or launch date, so nothing here
says how they are doing commercially. Their wording is paraphrased, not copied.

## 1. What changed on their side since 6 October

Nothing material on the product pages. One new blog post, "The Human in the Loop Is
Falling Asleep" (9 October), argues that approving every AI-categorised entry by hand
fails because reviewers tire; routine entries (known vendor, usual ledger, usual amount)
should post automatically and be sampled for error, and only exceptions should reach a
person. It is general advice and names no Lighthaus figure or customer.

The company: Lighthaus AI, Hyderabad, founders Samhith Kanamarlapudi (IIT Bhubaneswar,
ISB), Eshwar Mannuru and Amulya Penmetcha. They describe themselves as an AI-native
service company for finance operations. Search results for "Lighthouz AI" are a different
company, a US freight-finance product.

## 2. Two different businesses

| | Lighthaus | Taxmeow |
|---|---|---|
| Sold as | A service: their accountants keep the books, software inside | A product: the owner keeps the books through chat, a CA is optional |
| Customer | D2C and marketplace brands up to ₹10 Cr a month | Owners of retail, B2B and service businesses who are not accountants |
| Accountable | Their named accountants | The owner approves; their CA signs where law needs it |
| Channel | WhatsApp and Slack (Spark), English, Hindi, Telugu | Android app and the Windows desktop; WhatsApp as a share target |
| Spark's price | Free with an engagement, not sold alone | The product is the assistant |
| Proof of correctness | A human review stamp on each close | Dated rule records with act, section and source; golden cases that fail closed |

They overlap on one segment, a D2C seller who would rather keep control and pay less than
a managed service. "Beat them" means something different depending on whether the question
is about that segment or about the feature list.

## 3. The 6 October gap list, re-scored today

The revisited note listed eleven headline features of theirs. Status is ours as of today.

| Their feature | 6 October | 16 October |
|---|---|---|
| Invoice from one chat message, sent, IRN, booked | Partly | Built: invoice by message with preview, PDF and share; e-invoice from the invoice screen; export invoices; invoice design. IRN in the flow still needs NIC credentials |
| Purchase register matched to 2B; defaulting vendors flagged and chased | Partly | Built: credit at risk with a reason per bill, supplier reminders sent from the phone, MSME dues and pay-by dates. Fetching 2B needs a GSP |
| GST filed right, every state | Partly | Returns, set-off, payment, GSTR-9, QRMP, amendments, exports all drafted and reviewed. Live filing needs a GSP. Several GSTINs stay separate businesses by design |
| Settlement reconciliation per marketplace | Not built | Not built, not in the PRD |
| 194-O TDS and GST TCS against 26AS | Not built | Not built, not in the PRD |
| Margins by SKU and channel, books closed nightly | Partly | Daily checks run on launch, hourly and overnight; no SKU costing, by design |
| "Can I afford it?" cash answer | Not built | Built: `cash_forecast` and `can_afford`, every figure from the ledger |
| Hindi, Telugu, voice | Not built | Not built; waits on the model decision (ADR-0004) |
| Answers auditable to the entry; Excel on demand | Partly | Built: every figure from a named tool; entries, trial balance, Tally and full-business exports |
| Escalates to an accountant | Partly | Built: "Ask my CA" with attachments, document requests, assigned reminders |
| Remembers follow-ups | Not built | Built: reminders with an assignee; a document that arrives opens from its reminder |

Seven of the eleven are closed. Of the four left, two are deliberately outside the PRD
(their marketplace wedge) and two wait on outside parties (GSP and NIC credentials; the
language model). None of the four is a matter of writing code we have not written.

## 4. Where we are ahead on things they do not claim

- The owner approves; nothing is filed or sent without it. Their pitch is "you never touch
  a ledger"; ours is "you never need to, but nothing happens without you".
- No guessed tax rates and no model-produced figures. Their invoice demo has the
  assistant choose the GST rate. We refuse and show what this customer was charged before.
- Statutory rules are dated and cited and fail closed outside their window. Their public
  proof of correctness is a human review stamp; ours can be demonstrated.
- A tamper-evident ledger, per-business isolation, and an action gate bound to the exact
  payload for anything that reaches a government system.
- Documents arrive on their own (mail, inbound keys, share target) and are read into a
  bill preview; Spark's page shows no document intake at all.

## 5. Where they are ahead

- Marketplace settlement reconciliation, 194-O and TCS trails, multi-state APOB books and
  SKU margins. This is their wedge and they are deep in it. We only lose here if
  marketplace sellers become a target segment.
- Hindi and Telugu on WhatsApp. Ours is English in the app until the model decision and
  Meta business verification.
- A human team standing behind every filing. For a brand that wants to outsource
  accountability, that is the product; it is also what makes their business a service with
  service margins.

## 6. The honest answer for an investor

On the owner-led product, we are ahead of what they show publicly, and we can demonstrate
correctness where they assert it. On marketplace sellers, they are ahead by design and we
have not chosen to compete there. The decision that settles the comparison is still the
first open question from 6 October: are marketplace sellers a target segment? Everything
else that separates us needs a credential or a decision, not code.

## Sources

- [Lighthaus home](https://getlighthaus.ai/), [Meet Spark](https://getlighthaus.ai/meet-spark),
  [Blog](https://getlighthaus.ai/blogs),
  [The Human in the Loop Is Falling Asleep](https://getlighthaus.ai/blogs/the-human-in-the-loop-is-falling-asleep)
- [Samhith Kanamarlapudi on LinkedIn](https://www.linkedin.com/in/samhithk/),
  [Lighthaus on LinkedIn](https://www.linkedin.com/company/lighthaus-ai)
- This repository: `STATUS.md`, `docs/superpowers/PROGRESS.md`, `docs/product/ROADMAP.md`
