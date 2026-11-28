# Changing a statutory rule

A rule (a GST rate list, a due date, a time limit, a threshold) is a dated record, not code. There are two ways to change one. Neither needs a code change.

## 1. On the running server, no deploy (use this when a notification lands)

Admins only: the user ids listed in `MYCA_ADMIN_USER_IDS`. Everyone else gets 404.

Add a change. It takes over from the rule in force on its start date, and earlier dates keep the old rule:

```
POST /v1/admin/rules
{
  "reason": "Notification 12/2026-Central Tax dated 1 Dec 2026",
  "record": {
    "id": "gst.itc.time-limit",
    "value": { "month": 12, "day": 31, "after": "end_of_financial_year_of_the_invoice", "orAnnualReturnIfEarlier": true },
    "basis": "period_end",
    "effectiveFrom": "2026-12-01",
    "effectiveTo": null,
    "act": "CGST",
    "section": "16(4)",
    "source": "Notification number, date and what it says, in words a reviewer can check.",
    "attestations": []
  }
}
```

Send `records` (1 to 50) instead of `record` to change several rules at once. All are accepted or none are.

- `reason` is required and kept with who made the change and when.
- The change is checked before it is stored. A malformed record is refused with `RULE_INVALID` and the problems. A change that overlaps another active runtime change on the same rule is refused with `RULE_CONFLICT`: withdraw the earlier one first, or start the new one after it.
- It applies on this instance at once. Every other instance reloads within a minute.

List everything, with history: `GET /v1/admin/rules`.

Withdraw a change (it stays in the list as history, and the rule goes back to what it was): `DELETE /v1/admin/rules/<id>` with `{ "reason": "..." }`.

If the stored changes were ever inconsistent, the instance keeps the rules it had and logs `overlay refused`; a fresh instance starts on the built-in rules and logs an ERROR (`runtime rule changes are not valid`) until an admin withdraws the bad change. Watch for that log line.

## 2. In the repository (use this for the permanent record)

Put the same record in a `*.json` file in `sprints/statutory-rules/data/` (see the README there). It is loaded on top of the built-in rules. Once it ships, withdraw the runtime copy.

## Who has checked it

A record with an empty `attestations` list is shown to people as unreviewed. Add `{ "by": "<name>", "role": "advisor", "firmId": null, "on": "YYYY-MM-DD", "verdict": "verified" }` only when a named professional has actually checked it.
