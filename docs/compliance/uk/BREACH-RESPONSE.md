# MyCA UK: personal data breach response

Draft 2026-11-14. Adds the UK reporting duties to the general procedure in
[`docs/operations/INCIDENT-RESPONSE.md`](../../operations/INCIDENT-RESPONSE.md) (contain, find out,
tell, recover). Follow that file for the technical steps; follow this one for who to tell in the UK
and by when.

## Who does what

| Role | Person | Backup |
|---|---|---|
| Breach lead (decides, signs reports) | [Owner to name] | [name] |
| Technical lead (contain, investigate) | [name] | [name] |
| Communications (users, accountants) | [name] | [name] |
| HMRC contact (the responsible individual on the Developer Hub application) | [name] | [name] |

Phone numbers and out-of-hours contacts: [private runbook, not in the repository].

## The clock

The 72 hours start when MyCA becomes **aware** of a breach: when we are reasonably certain that a
security incident has led to personal data being lost, destroyed, altered, disclosed or accessed
without authority. Write the time down first.

| By | Who | What |
|---|---|---|
| Hour 0 | Breach lead | Open the incident log (private issue). Record time of awareness, what is known |
| Hour 1 | Technical lead | Contain (INCIDENT-RESPONSE.md section 1). If HMRC tokens or submissions may be involved, switch off HMRC calls for the UK deployment (`MYCA_PROVIDER_ENV=off`) |
| Hour 4 | Breach lead | First assessment: what data, how many people, likely consequences, whether HMRC data or tokens are involved |
| Hour 24 | Breach lead | Decide whether the ICO must be told (below). Draft the ICO and HMRC reports |
| **Hour 72** | Breach lead | **Report to the ICO** if required. **Report to HMRC** if it involves customer data handled through HMRC's APIs |
| Without undue delay | Communications | Tell affected people if the risk to them is high |
| Within 72 hours of a later finding | Breach lead | Send further information to the ICO and HMRC as it comes in (reports can be in phases) |

## 1. Telling the ICO (UK GDPR Article 33)

Report unless the breach is **unlikely to result in a risk** to people's rights and freedoms. A
breach involving NINOs, UTRs, financial records or HMRC tokens should normally be treated as
reportable.

- How: the ICO's online personal data breach report form, or the ICO helpline 0303 123 1113
  (**check before relying** that both are current).
- What to give: what happened and when; categories and approximate numbers of people and records;
  the likely consequences; what we have done and will do; the breach lead's contact details.
- If it is past 72 hours, report anyway and say why it is late.
- Record every breach in the breach log, including those not reported, with the reason.

## 2. Telling HMRC

HMRC's terms of use for software developers require a breach of customer data to be reported to
HMRC within **72 hours** (gb.md).

- To: the contact named in the Developer Hub terms of use and in HMRC's production approval email
  [**check before relying**: copy the exact address into the private runbook when production access
  is granted].
- Give: application name and client id (never the secret), the APIs involved, the taxpayers or VRNs
  affected (in the secure way HMRC asks), whether tokens may be misused, what we have done.
- If tokens may have been taken: rotate the application's client secret in the Developer Hub, delete
  stored tokens for the affected businesses, ask HMRC whether it can revoke the tokens it issued,
  and ask affected users to reconnect.
- If fraudulent submissions may have been made: tell HMRC which submissions (receipt ids) so it can
  check them.

## 3. Telling affected people (Article 34)

Tell people without undue delay when the breach is likely to result in a **high risk** to them.

- In the app and by email, in plain English. Say: what happened; what data; what we are doing; what
  they should do (check their HMRC online account for submissions they did not make, watch for
  phishing that uses their details, reconnect HMRC, change their Google password if relevant); who
  to contact.
- Never ask for passwords or HMRC sign-in details in the message, and say so, because criminals
  copy breach emails.
- Where an accountant firm is the controller of its clients' data, tell the firm first, without
  undue delay, and support it in telling its clients (MyCA as processor, Article 33(2)).

## 4. Others

| Who | When |
|---|---|
| Action Fraud (and the police) | Where a crime is suspected, for example data offered for sale |
| NCSC | Significant cyber incidents (optional, for help) |
| Google Play | If the app, the signing key or billing is involved |
| Processors and sub-processors | If their systems are involved, at once |
| Insurer | As the cyber policy requires [policy to confirm] |
| ISO 27001 and SOC 2 auditors | As the certification body requires |

## 5. After

- Fix the cause, add a regression test, and write a short summary in `docs/audit/` with no exploit
  detail.
- Update the DPIA risks and this file.
- Yearly: a tabletop exercise of this procedure with the named people.

## Breach log fields

Date and time of awareness; detected by; description; data categories; number of people; number of
records; HMRC data involved (yes or no); consequences; containment; reported to ICO (time,
reference) or reason not; reported to HMRC (time, reference); people told (time, how); lessons.
