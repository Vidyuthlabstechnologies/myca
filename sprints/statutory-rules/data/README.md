# Rules kept as data

Every `*.json` file here is a list of rule records, loaded on top of the built-in rules in
`../src/rules/`. A record here wins over any older version of the same rule it overlaps: older
versions are cut short, started later, or split around it. So a change in the law is one record:

```json
{
  "id": "due-date.gst.gstr-4",
  "value": { "period": "year", "monthsAfterPeriodEnd": 3, "day": 30 },
  "basis": "period_end",
  "effectiveFrom": "2026-03-31",
  "effectiveTo": null,
  "act": "CGST",
  "section": "rule 62(1)",
  "source": "Where it comes from: the notification number and date, in words a reviewer can check.",
  "attestations": []
}
```

Add an attestation (`{ "by": "CA name", "role": "advisor", "firmId": null, "on": "2026-11-27", "verdict": "verified" }`)
once a professional has checked it; until then the app tells people the rule is unreviewed.

To change a rule on a running server with no deploy, use the admin endpoint described in
`docs/operations/RULES.md`.
