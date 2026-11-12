# Feature spec 10: Audit trail

| | |
|---|---|
| Requirements | NFR-5 in the [product PRD](../PRD.md) |
| Status | Built (batch 4, 2026-11): the trail as a read tool, chat words, an Excel workbook and an app screen; a hash chain over each event; the hosted split between the books and the `audit_log` table. The chain has no key and the limits below apply |
| Code | `platform/src/audit-trail.mjs`; `appendAuditEvent` and `auditEventHash` in `platform/src/ca-api.mjs`; `auditTrailSheets` in `platform/src/report-sheets.mjs`; `planAuditTrailFromChat` in `platform/src/audit-trail-intent.mjs`; the reply in `platform/src/router.mjs`; `cloud/src/books-runner.mjs`; `mobile/lib/screens/audit_trail_screen.dart` |

## What the owner experiences

The owner, or the CA, asks who changed what and when. MyCA lists the changes made through
it in a month, a period or between two dates: who made each one, when, which invoices,
bills or other records were involved and which ledger entries it posted. Above the list it
says whether the log of events still checks out and, when it does not, which event is the
first at fault. The same list is a sentence in chat, a screen in the app and an Excel
workbook.

## User stories

1. As an owner, I see who changed my books, when, and which records.
2. As an owner, I see when a period was locked or unlocked, by whom and why.
3. As a CA, I take the events of a period and its entries in one workbook.
4. As an owner, I am told when an event in the log was altered after it was written, and
   which event to look at first.

## Behaviour

### What is recorded (built)

- These are events: sign-in, sign-out and PIN changes (`session.*`); chat messages,
  proposals, confirmations and discards (`chat.*`); each tool call (`tool.<name>`), reads
  included; file uploads and attachments (`file.*`); documents, clients, users, invoices
  and purchases added through the CA API (`documents.*`, `client.*`, `user.*`,
  `books_ledger.*`); exception decisions (`exceptions.*`); repeating entries posted
  (`recurring_posted`); bank rules applied (`bank_rule_applied`); and calls to outside
  systems through the action gate (`external.*`, `sandbox.*`). Each reads as a sentence in
  the list, one per action ("Push to Tally"), followed by "did not go through", "no answer
  came back, so it may not have gone through" or "(simulated)" when that is what happened,
  and an event written without a name takes the name of the signed-in user, else of the
  user with that id; ids such as `automation` stay as they are. The local CA API's
  audit-events route adds an event under the signed-in user's id and name whatever the
  request body says, and refuses when nobody is signed in.
- An event holds an id (AUD-000001 onward), the time, the user's id and name as signed in,
  the client it is filed under, the action, a digest of the books before and after, and
  details. The id comes from a counter kept with the log, so an id is not given again
  after events have been removed, and an id that is already in the log is refused. For a
  change made through chat or a tool the details list the ids of the records involved and
  of the ledger entries posted (at most twenty) and the range of ledger entries the call
  added, which the trail shows as transfer ids. Locking and unlocking a period keep the
  date and the reason (cut to 500 characters).
- The trail calls an event a change when the books' digest moved or the action is one that
  changes the books, for example a confirmation, a repeating entry, a bank rule, an
  exception decision, a file, document, client or user event, a period lock or unlock, a
  document request, a document marked received, a corrected evaluation, a document share
  that recorded something, or a chat message that posted or that ran one of the tools
  that change the books without asking for a yes. A share that was cancelled or failed is
  not a change. Sign-ins, sign-outs and PIN changes are session events. Everything else
  is a read.

### Which day an event falls on (built)

- An event falls on the calendar day of its time on the computer MyCA runs on. That is the
  calendar "today", "this month" and a range such as 2026-11-07 to 2026-11-07 use. A
  change made at 18:00 on 7 November on a computer set to Pacific time is listed under 7
  November and under that range, and a change made at 00:30 on 1 November in India is
  listed under November. The last second of the last day is inside a range and the first
  second of the next day is outside it. A time that cannot be read falls on the day given
  by its first ten characters.
- The stored time is UTC (`at` is an ISO UTC string and is part of the hash). The chat
  reply prints the local date and time of the computer without a zone label. The Excel
  column "When (UTC)" and the app's list print UTC. The hosted service sets no time zone,
  so it runs on UTC and its days are UTC days; there the day and the time shown agree.
- The Excel workbook uses the same filter for its Audit trail sheet and its Summary, so the
  counts on the Summary are the rows of the sheet. Its Entries sheet is the day book of
  the same dates, which are the dates entries carry and not the times of events.

### The hash chain (built)

- Each event carries a `hash` and the previous event's hash (`prevHash`). The hash is
  SHA-256 over the event's id, the user's id and name, the action, the time, the two
  digests, the details with their keys in sorted order at every depth, and the previous
  hash. The sorted order means the order a database returns the keys in does not matter.
  The client the event is filed under is not part of the hash, because renaming a client
  changes it.
- The check walks the log from the first event. Older events with no hash that come
  before the first hashed one are counted and not checked. After the chain has started, an
  event with no hash, a hash that does not match the event's own content, or a previous
  hash that does not match the event before it fails the check, and the result names that
  event. A log with no hashed event reports as verified with no events. The check runs
  each time the trail is read.

### What the chain shows and does not show

- It shows that an event was edited after it was written when a newer event follows it:
  a change to the id, the user, the action, the time, the digests or the details no
  longer matches the hash. It shows an event taken out of the middle or from the front of
  the log, and an event whose hash was removed.
- It does not show events cut off the end of the log: the log is shorter and still checks
  out.
- It does not show a log that someone able to write the books has re-sealed. The hash has
  no key, so anyone can recompute every hash after an edit.
- It does not cover the client an event is filed under, so changing that label leaves the
  check passing. The chat reply, the Excel summary and the app's chain line say so beside a
  passing result.
- It does not cover events written before the chain started, because they carry no hash.
  The same three places say how many there were beside a passing result ("4 earlier events
  were recorded before sealing and are not covered"), and say nothing when there are
  none.
- It does not say who appended an event. The user's id and name are text inside the
  event and nothing signs them.
- Calls to outside systems that only read (a status check, a GSTIN look-up) sit in the
  changes view beside the ones that change something, because the view keeps `external.*`
  and `sandbox.*` events together.
- For these reasons a passing result is worded as verified and a failing one as broken at a
  named event. It is not worded as a guarantee that the log is whole. The app's list
  header and its Reports row say that the log is checked for edits and claim nothing
  more.

### Read the trail (built)

- `audit_trail` (read-only, and one of the queries the phone can ask on the hosted
  service) takes `period` (a month as `YYYY-MM`, or `this-month`, `last-month`,
  `this-quarter`, `this-year`, `last-year`; the quarter is the calendar quarter, and the
  year names are financial years, 1 April to 31 March) or `from` and `to` (a `from` alone runs
  to today, a `to` alone starts at the beginning of the log); `view`, which is `changes` by
  default and `all` to add reads, proposals and sign-ins; `actor`, a part of a user id or
  name; and `limit`, 1 to 2000, 200 when not given, keeping the latest events. With no
  period it takes the current month. It lists the events of the book that is open, oldest
  first, with how many were found and whether more exist, the result of the log chain, the
  result of the ledger's own checksum chain, and a note.
- Chat: "audit trail", "audit log", "edit log", "change log", "who changed" and "what
  changed in the books" ask for it, also in the plural and with a hyphen ("audit logs",
  "audit-trail"). Add a period in the same sentence ("audit trail for October", "audit
  trail from 2026-10-01 to 2026-10-31", "audit trail for FY 2025-26", "who changed the
  books last week"), a person ("audit trail by Priya"), a count ("audit trail limit 50",
  "last 20 changes in the audit log"), and "everything", "all events" or "including reads"
  for the all view. A period, a person or a count it recognises but cannot use (a day that
  is not on the calendar, a limit of 0) gets a sentence that says so and nothing is looked
  up; words it does not recognise at all are left out and the current month is used. "by
  me" is not read as a name, and an ordering word after "by" ("by date", "by newest") is
  not read as one either. The reply gives the count, the result of the log chain and the
  newest ten events with date, time, user and what was done. When a person or a count was
  given, a line under the first one says that only that person's events are counted or
  that the list is limited to the latest N, so a short list is not taken for a quiet
  period. A sentence that posts something and only mentions the words ("invoice Kiran
  Stores 25000 for audit trail review") is still a posting.
- App: Reports has an Audit trail row. The screen has chips for the period (this month,
  last month, this quarter, this year; the year is the financial year, 1 April to 31 March)
  and the view (changes, everything), a line with the
  result of the log chain, a warning when the ledger fails its own check, and the events,
  newest first, with date and time in UTC, the user and the record ids. "Show more" asks for
  the latest 2,000 and "Save as Excel" saves the workbook for the chosen period. There is no
  filter by person on the screen.
- Excel (`export_xlsx`, report `audit_trail`; chat: "excel of the audit trail for
  October"): three sheets. "Audit trail" has one row for every event of the period, reads
  and sign-ins included: event, when (UTC), who, action, what changed, records, transfers,
  the two digests and whether the event is chained. "Entries" is the day book of the same
  period. "Summary" gives the period, the counts of events and changes, the result of the
  log chain and of the ledger chain with its last checksum, the time of export and a
  SHA-256 of the audit rows as exported.

### Hosted service (built)

- Each write request runs under the lock on the business's books row. The events it
  appended are saved in the books row, so the chain covers them, and are copied in the
  same transaction into the `audit_log` table with the user, device and request that made
  the call. The table refuses updates and deletes, and refuses truncation. Only the purge
  of a business deleted thirty days earlier lifts the guard on updates and deletes, inside
  its own transaction; the guard on truncation is never lifted.
- The copy in `audit_log` takes the user and device from the signed-in request, not from
  the event, and the row is stamped with the time it was inserted. The event's own id,
  hash, client, user name and time are not copied.
- A read request, such as a query or the snapshot, does not rewrite the books row. Its
  event is written only to `audit_log`, and so is the event of a read through an
  accountant's shared copy. The list from `audit_trail` on the hosted service therefore
  holds what the books hold, and says that reads are kept in the hosted audit log.

## Limits

- The Excel workbook follows "by <name>" and "last N": the Audit trail sheet keeps that
  person's events, or the latest N, and the Summary sheet names the filter. The Entries
  sheet is still the whole period's day book. A name or count that cannot be read ("by
  me", "limit 5000") is said in words in the chat reply and not applied.
- The limits of the chain are in the section above: events cut off the end, a re-sealed
  log, the client label and the author of an event are not covered.
- Reads are not in the list on the hosted service (see above).
- The app and the workbook print UTC, while the chat reply and the choice of day use the
  clock of the computer MyCA runs on. They agree on the hosted service and differ on a
  desktop set to another zone.

## Acceptance criteria

- A stored event whose id, user name, action, time, digests or details are changed fails
  the check at that event.
- An event removed from the middle or the front makes the next event fail the check as a
  broken link. An event with no hash after the chain has started fails the same way.
- Events cut off the end, or a log re-sealed after an edit, leave the check passing; the
  trail and this document say so.
- Details with the same content in any key order give the same hash.
- On a computer set to America/Los_Angeles a change made at 18:00 on 7 November is listed
  for 2026-11-07 to 2026-11-07 and not for the 8th; on one set to Asia/Kolkata a change
  made at 00:30 on 1 November is listed for November and not for October. The chat reply
  prints the local time of the same event.

## Out of scope

A keyed chain, a signature for each user, and holding the newest hash outside the books so
that cut-off events show. None of these is built.

## Open questions

- Should the newest hash also be kept where the books cannot rewrite it, for example in
  the hosted `audit_log`, so that removing the newest events shows?
