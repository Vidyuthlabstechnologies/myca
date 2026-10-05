# Feature spec 07: CA collaboration

| | |
|---|---|
| Requirements | FR-CA-1 to 4 in the [product PRD](../PRD.md) |
| Status | Invite and remove built; entries export and the sync setting not built |
| Code | `cloud/src/members.mjs`, `cloud/src/businesses.mjs`; app: `mobile/lib/screens/people_screen.dart`, `invitation_cards.dart` |

## What the owner experiences

The owner gives their CA access in one of two ways: export the entries and send the
file, or add the CA to the business. With the second, the owner chooses whether the CA
sees changes as they happen or at set intervals.

## User stories

1. As an owner, I invite my CA by phone number and can remove them at any time.
2. As an owner, I choose how current the CA's view is.
3. As an owner without a CA on the product, I export my entries in a format their
   software reads.
4. As a CA, I open a client's business and see what needs my attention first.
5. As a CA with several clients on the product, I switch between them.

## Behaviour

### Invite (built)

- The owner invites by phone number with a role: staff or accountant. The invitation is
  stored against a hash of the number; the invited person sees it after signing in with
  that number and accepts or declines.
- Roles map to engine roles: owner to admin, staff to staff, accountant to partner.
- A business always has at least one owner. Removing a member takes effect on their
  next request.
- A person who belongs to several businesses switches between them in the app.

### Export (to build)

- An export of the period's entries as a Tally-importable file and as a spreadsheet:
  day book, sales and purchase registers, trial balance.
- All CSV output goes through `text-safe.mjs`.
- An export is audited: who exported what period and when.

### Sync setting (to build)

- Real time: the accountant reads the live books, as today.
- At intervals: the accountant reads the books as of the last sync point. The owner
  sets the interval (daily, weekly, at month close) or pushes a sync by hand.
- This needs a stored snapshot per sync point. The journal is append-only, so a sync
  point can be a position in the journal, not a copy of the data.

### What an accountant may do (to decide)

- Today an accountant can record entries and decide exceptions, the same as staff.
- Whether an accountant may approve a filing is PRD question Q2.

## Acceptance criteria

- A non-member asking for a business gets the same answer as for a business that does
  not exist.
- A removed accountant's next request fails.
- With interval sync, an entry posted after the sync point is not visible to the
  accountant until the next one.
- An exported file re-imported into a fresh business reproduces the same trial balance.

## Out of scope

Billing between CA and client, a CA-firm console for hundreds of clients (the desktop
app covers that case today), messaging between owner and CA inside the product.

## Open questions

- Q2 in the PRD.
- Can an accountant invite their own article staff to a client's business?
