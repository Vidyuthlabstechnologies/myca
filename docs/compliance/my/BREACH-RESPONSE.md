# MyCA Malaysia: personal data breach response runbook

Status: draft, 14 November 2026. Implements PDPA s12B (in force 1 June 2025) and the
Commissioner's Guideline on Data Breach Notification (2025). Use it for any incident that touches
Malaysian users' personal data, whether MyCA is the controller (accounts, individual tax figures)
or the processor (a business's books, its e-invoices).

Clock rule: **T0 is the moment anyone at MyCA has reason to believe a breach has happened.**
Every time below counts from T0, including weekends and public holidays.

| Deadline | What |
|---|---|
| T0 + 1 hour | Incident lead named, DPO told, containment started |
| T0 + 24 hours | Initial assessment written: what, how many, which data, harm |
| **T0 + 72 hours** | **Notify the Personal Data Protection Commissioner** (if notifiable). Late? Give written reasons and evidence |
| **Within 7 days of notifying the Commissioner** | **Notify affected data subjects** (if significant harm) |
| Without delay | If MyCA is the processor, tell each affected business (the controller) so it can notify |
| 30 days | Post-incident review, register updated, fixes tracked |
| 2 years minimum | Keep the breach register entry |

## 1. Roles

| Role | Person | Backup |
|---|---|---|
| Incident lead (decides, owns the clock) | [Owner to name] | [Owner to name] |
| Data protection officer (talks to the Commissioner and data subjects) | [DPO] | [Deputy] |
| Engineering on call (contain, collect evidence) | [Name] | [Name] |
| Communications (user emails, in-app banner, press) | [Name] | Incident lead |
| Counsel (Malaysia) | [Firm] | |

Contact sheet lives in the team password manager, not in the repository.

## 2. Detect and contain (first hour)

1. Open an incident record (the breach register, section 7) with T0, who reported, first facts.
2. Contain without destroying evidence:
   - Rotate the affected secrets in Secret Manager: `MYCA_BOOKS_KEY` only with a planned
     re-seal; MyInvois intermediary client secrets (generate new in the MyInvois portal, revoke the
     old); the signing certificate (ask the CA to revoke if the private key is exposed); database
     and service-account keys.
   - Revoke sessions: sign out affected users' devices (`devices` table), invalidate refresh tokens.
   - Block the path: Cloud Armor rule, disable the endpoint by environment flag, scale the service
     to zero if needed.
3. Preserve evidence: export Cloud Logging (request logs, pgaudit) for the window to a locked
   bucket; snapshot the database; note every action taken and its time.

## 3. Assess (by T0 + 24 hours)

Answer each in the register:

- What happened, when, how found, is it still going on?
- Which data sets: account, individual tax, business books, e-invoices, documents?
- Which data types: names, NRIC or passport numbers, TINs, bank lines, income figures, sign-in
  details?
- How many Malaysian data subjects (count customers' counterparties too)?
- Was the data encrypted and was the key also exposed? (Sealed books with an unexposed key lower
  the risk; record the reasoning.)
- Controller or processor for each data set?

### Is it notifiable?

Notify **the Commissioner** if the breach causes or is likely to cause **significant harm**, or is
of **significant scale** (more than 1,000 data subjects).

Notify **the data subjects** if it causes or is likely to cause **significant harm**, meaning any
of:

- physical harm, financial loss, a negative effect on credit records, or damage to or loss of
  property;
- misuse of personal data for illegal purposes;
- compromise of sensitive personal data (financial information counts, so most MyCA data does);
- a combination of personal data that could enable identity fraud (for example NRIC plus name plus
  address).

If in doubt, notify. Record the decision and who made it either way.

## 4. Notify the Commissioner (by T0 + 72 hours)

- Use the Commissioner's breach notification form on https://www.pdp.gov.my/ (check the current
  form and submission channel at the time; the Guideline allows submission online or by email).
- Content: controller details and DPO contact; date and time of breach and of discovery; nature
  and cause; data types and approximate numbers of data subjects and records; likely consequences;
  measures taken and planned; whether and how data subjects are being told.
- If all facts are not known, send what is known within 72 hours and follow up in phases.
- If the 72 hours are missed, send the notice with written reasons for the delay and evidence.

## 5. Notify data subjects (within 7 days of the Commissioner notice)

Channels in order: email to the account address, in-app banner and notice, SMS if phone sign-in
was used. Public notice (website) if individuals cannot be reached.

Template (English; Malay below). Plain words, no blame, say what to do.

> **Subject: Important: a security incident affecting your MyCA account**
>
> On [date] we found that [what happened in one sentence]. It affected [which of your data].
> We [what we did: stopped it, reset your sign-in, told the Personal Data Protection Commissioner].
> What you can do: [sign in again; watch for messages pretending to be LHDN or MyCA; check your
> bank statements]. We will never ask for your password or a one-time code.
> Questions: our Data Protection Officer, [name], [email], [phone].

> **Subjek: Penting: insiden keselamatan yang menjejaskan akaun MyCA anda**
>
> Pada [tarikh], kami mendapati bahawa [apa yang berlaku dalam satu ayat]. Ia menjejaskan [data
> anda yang mana]. Kami telah [apa yang kami lakukan: menghentikannya, menetapkan semula log masuk
> anda, memaklumkan Pesuruhjaya Perlindungan Data Peribadi]. Apa yang boleh anda lakukan: [log
> masuk semula; berhati-hati dengan mesej yang menyamar sebagai LHDN atau MyCA; semak penyata bank
> anda]. Kami tidak akan sekali-kali meminta kata laluan atau kod sekali guna anda.
> Pertanyaan: Pegawai Perlindungan Data kami, [nama], [e-mel], [telefon].

## 6. When MyCA is the processor

For a business's books and e-invoices, the business is the controller. Tell every affected
business owner without undue delay (target: within 24 hours of T0) with the facts in section 4 so
they can meet their own 72-hour clock; offer the counterparties list and the template above. If
the contract with the customer says MyCA notifies on its behalf, do that and copy the owner.

If LHDN MyInvois credentials or the signing certificate were exposed, also tell LHDN through the
MyInvois support channel so it can watch for documents submitted in the taxpayer's name.

## 7. Breach register

One row per incident, kept at least **two years**, including incidents judged not notifiable.

| Field | |
|---|---|
| Incident id, T0, detected by | |
| Summary, cause | |
| Data sets, data types, number of data subjects, controller or processor | |
| Significant harm? Significant scale? Decision, by whom, why | |
| Commissioner notified (date/time, reference) or reason not | |
| Data subjects notified (date, channel, count) or reason not | |
| Controllers (businesses) notified | |
| Containment and remediation actions | |
| Lessons and follow-up issues | |

## 8. After the incident (within 30 days)

- Root cause written up; fixes as tracked issues with owners.
- Update this runbook, `PDPA-COMPLIANCE.md` and the security controls.
- Tabletop exercise of this runbook once a year and after any real incident.

Sources (accessed 2026-11-14):
- DLA Piper, Malaysia guidelines on breach notification and DPO (March 2025): https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/
- CMS, "New Guidelines on Mandatory Breach Notifications under Malaysia's Personal Data Protection Act 2010": https://cms.law/en/sgp/legal-updates/new-guidelines-on-mandatory-breach-notifications-under-malaysia-s-personal-data-protection-act-2010
- Daniel & Hiew (DNH), "Guideline on Data Breach Notification 2025": https://dnh.com.my/guideline-on-data-breach-notification-2025-guideline/
- Personal Data Protection Department portal: https://www.pdp.gov.my/
