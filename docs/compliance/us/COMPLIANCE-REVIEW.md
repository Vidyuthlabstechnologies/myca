# MyCA US compliance review

Draft for counsel and store submission, 2026-11-14. Scope: the MyCA US app (`com.mldynamic.myca.us`,
`MYCA_EDITION=US`) and its hosted API for the 2027 filing season (tax year 2026), when returns are
e-filed through an embedded partner (Column Tax or April), and MyCA's own IRS MeF route for 2028.

This is an engineering reading of the official sources linked in each row, not legal advice. Every
row marked **owner** or **counsel** needs a person at ML Dynamic Solutions or its US counsel.

Status words: **done** (in the code on this branch, with a test where it can be tested), **gap**
(engineering still owes it; who and what is in the row), **owner** (only the owner or counsel can do it).

## What changed on this branch

| Change | Where | Test |
|---|---|---|
| Signed, versioned IRC 7216 consents: three separate forms (SSNs to the e-file partner, return to an Expert Review CPA or EA, use of the filed return for MyCA Plus), Rev. Proc. 2013-14 §5.04 statements word for word, TIGTA line, preparer and taxpayer named, typed-name signature (§6.02(b)), one year by default or a date the filer picks (up to three years), the exact signed text and its SHA-256 kept, withdrawable, audited without the name | `cloud/src/us-7216.mjs`, `cloud/migrations/033_us_7216_consents.sql`, `GET/POST /v1/me/us-consents`, `DELETE /v1/me/us-consents/{document}` in `cloud/src/api.mjs` | `cloud/test/us-compliance.test.mjs` |
| A consent with a bracketed blank on it cannot be signed in production (Rev. Proc. 2013-14 §5.04(4): no blanks completed after signing) | `createUsConsents` `CONSENT_NOT_FINAL` | same |
| A consent naming one partner does not cover another: the version carries the partner id | `usConsentForms` | same |
| SSNs and ITINs go to the e-file partner only when the operator allows it (`MYCA_US_FILER_SEND_TINS=1`) **and** the filer holds a valid partner consent. The server sets `shareTins` on every propose and confirm; whatever the caller or the model sends is overwritten | `cloud/src/api.mjs` (`asUsFiling`, propose), `platform/src/us-efile.mjs` (`filePartner`), `platform/src/us-filing-partner.mjs` (`startPartnerFiling`), schema `platform/src/tool-schemas-us.mjs` | same |
| Signing or filing a US return needs two-step sign-in. Always on in production; `MYCA_US_REQUIRE_SECOND_STEP=1` turns it on elsewhere (IRS Pub 1345: second factor before transmitting; FTC 314.4(c)(5)). Covers propose, confirm and a chat "yes" | `cloud/src/us-safeguards.mjs`, `cloud/src/api.mjs` (`secondStepMissing`) | same |
| The nightly purge keeps a deleted household while MyCA itself e-filed a return for it (`transport: 'mef'`, `mode: 'live'`): three years from the later of the due date and the IRS receipt, then erases it as before. Sandbox and partner filings are not held (the partner, as ERO, keeps Form 8879) | `cloud/src/us-retention.mjs`, `cloud/src/jobs.mjs` (`recordsHeldUntil`) | same |
| A US-only deployment accepts only the US privacy notice, and `CONSENT_REQUIRED`/`GET /v1/me` name the US version. Before, accepting the India notice opened a US account | `cloud/src/consent.mjs` (`noticesFor`, `createConsent`), `cloud/src/api.mjs` | same |
| Every server log line goes through `redactTinsDeep`, so an error stack or log field cannot carry a full SSN or ITIN | `cloud/src/server.mjs` | same |
| US privacy notice `us-draft-2026-11-14.2`: the Pub 1345 safeguards sentence word for word, adults only and under-13 statement, rights wherever the filer lives (know, correct, delete, 45 days, authorized agent, no discrimination), no sale or sharing and sensitive data used only for the service, payment processors named, SSNs to the partner only with the separate consent, retention by route, breach promise, changes. The owner blanks are kept: the US company, the partner, the privacy contact (and counsel's retention note) | `cloud/src/consent.mjs` `PRIVACY_NOTICE_US` | same |
| MyCA Plus states the automatic renewal terms (renews every year at the price until cancelled, how to cancel, what happens after) beside the subscribe button | `mobile/lib/screens/us/us_plus_screen.dart` (two strings) | `mobile/test/us_plus_test.dart` |

Test runs on this branch: `cloud/test/us-compliance.test.mjs` 13/13; with it `consent`, `us-filer-webhook`,
`us-launch-flow`, `us-card-checkout`, `us-efile-open`, `us-return-billing`, `account-erasure`,
`us-household`, `audit-data-lifecycle` 44/44, `jobs`, `second-factor`, `audit-auth-secrets` 30/30;
platform `us-filing-partner`, `us-efile` 30/30, `c0-remote-contract`, `us-identity`, `us-1040` 51/51;
mobile `us_plus_test.dart` 8/8.

## Checklist

### IRS

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 1 | Online Provider standard 1: Extended Validation TLS certificate, TLS 1.2+, 2048-bit RSA / 128-bit AES on the site that takes returns | [Pub 1345 (Rev. 10-2026) p.4-5](https://www.irs.gov/pub/irs-pdf/p1345.pdf); [six standards](https://www.irs.gov/e-file-providers/irs-e-file-security-privacy-and-business-standards-mandated-as-of-january-1-2010) | owner (2028 own route; in 2027 the partner's site takes the filing) | Cloud Run's managed certificate is DV. Buy EV for the filing domain before MyCA files itself |
| 2 | Standard 2: weekly external vulnerability scans by a PCI Approved Scanning Vendor located in the US; host PCI DSS compliant; keep reports one year | same | owner | WISP section 4 |
| 3 | Standard 3: written privacy and safeguard policy with the sentence "we maintain physical, electronic and procedural safeguards that comply with applicable law and federal standards", certified by a privacy seal vendor acceptable to the IRS | same | done (text); owner (seal vendor, publish on the site) | `PRIVACY_NOTICE_US` "How it is protected" |
| 4 | Standard 4: protection against bulk filing of fraudulent returns; taxpayer information not collected outside the website | same | gap (owner + engineering for 2028) | Google sign-in only in the US app; rate limits (`cloud/src/rate-limits.mjs`). Before the own route: a filings-per-account and per-device limit and a challenge on account creation |
| 5 | Standard 5: domain registered with a US-based ICANN registrar, locked, not private | same | owner | Check the filing domain's registrar and turn off privacy |
| 6 | Standard 6: report a security incident to the IRS no later than the next business day after confirmation; stop collecting through the site if it is the cause | same | done (plan); owner (named contact) | WISP section 7, `docs/operations/INCIDENT-RESPONSE.md` |
| 7 | Second factor before a taxpayer transmits a return; MFA before reaching stored tax data on an existing account; NIST out-of-band, not email | [Pub 1345 p.4](https://www.irs.gov/pub/irs-pdf/p1345.pdf) | done for signing and filing (production); gap for "MFA before reaching stored tax data" | `cloud/src/us-safeguards.mjs`. Google sign-in is one factor. To meet the second half, require two-step sign-in at US account creation (owner decision, then UI) |
| 8 | Form 8879 and the return kept three years from the due date or IRS received date, whichever is later; tamper-proof, retrievable | [Pub 1345, Form 8879 recordkeeping](https://www.irs.gov/pub/irs-pdf/p1345.pdf); [e-signature FAQ](https://www.irs.gov/e-file-providers/frequently-asked-questions-for-irs-efile-signature-authorization) | done (own route); partner keeps it in 2027 | `cloud/src/us-retention.mjs`, `jobs.mjs`; notice "How long we keep it" |
| 9 | Remote e-signature of 8879: identity verification by knowledge-based authentication, three tries then paper; record the signed image, time, IP, user name, verification result and method | [e-signature FAQ](https://www.irs.gov/e-file-providers/frequently-asked-questions-for-irs-efile-signature-authorization) | partner (2027); gap for 2028 | The own route captures PIN, device, IP and time (`us-efile.mjs`) but has no KBA step. Self-Select PIN with prior-year AGI is the IRS's own method and needs no KBA; if MyCA ever signs 8879 as ERO by e-signature, add a KBA vendor |
| 10 | EFIN: every Principal and the Responsible Official is a US citizen or lawful permanent resident, 18+, fingerprinted or credentialed, passes suitability | [Pub 3112 (Rev. 11-2025) p.5](https://irs.gov/pub/irs-access/p3112_accessible.pdf) | owner | US-LAUNCH "Legal and IRS" |
| 11 | WISP (Pub 4557, Pub 5708; FTC Safeguards Rule) | [Pub 4557 (Rev. 6-2024)](https://www.irs.gov/pub/irs-pdf/p4557.pdf) | done (draft); owner (Qualified Individual, sign-off) | `docs/compliance/us/WISP.md` |

### IRC section 7216

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 12 | Return information disclosed to another preparer in the US, or to an auxiliary service provider, to prepare or file the return needs no consent, unless the service is a substantive determination or advice | [26 CFR 301.7216-2(d)(1)](https://www.law.cornell.edu/cfr/text/26/301.7216-2) | done | Partner prefill without SSNs, Anthropic (US, SSNs removed, `redactModelRequest`), Google Cloud. Counsel to confirm Anthropic as an auxiliary service provider |
| 13 | Any disclosure to a preparer outside the US (including our own staff) needs a prior signed consent; SSNs only with consent and an adequate data protection safeguard on both sides | [301.7216-2(c)(2)](https://www.law.cornell.edu/cfr/text/26/301.7216-2), [301.7216-3(a)(3)(i)(D), (b)(4)](https://www.law.cornell.edu/cfr/text/26/301.7216-3), [Rev. Proc. 2013-14 §5.04(1)(e), §5.07](https://www.irs.gov/pub/irs-drop/rp-13-14.pdf) | owner | The US stack in `us-central1` and "staff outside the United States cannot reach them" (notice) is what makes this hold. India-based engineers must not get production access to the US project, its database or its logs. Record it in the access list (WISP section 5) |
| 14 | Consent content: preparer's name, taxpayer's name, purpose, specific recipient, the information, signed and dated | [301.7216-3(a)(3)(i)](https://www.law.cornell.edu/cfr/text/26/301.7216-3) | done | `renderConsent` |
| 15 | 1040 consents: §5.04(1)(a)/(b)/(c) statements in order, (d) TIGTA line, affirmative (no opt-out), signed by PIN of 5+ characters, a typed name not filled in by the software, or 5+ shared-secret characters; text at least body size, enough contrast, printable; each disclosure or use on its own screen; disclosure and use consents separate | [Rev. Proc. 2013-14 §5.01-5.05, §6](https://www.irs.gov/pub/irs-drop/rp-13-14.pdf) | done (server); gap (UI) | `cloud/src/us-7216.mjs`. UI owed, see "Screens owed" |
| 16 | Consent valid for the period the taxpayer picks, else one year | Rev. Proc. 2013-14 §5.04(1) | done | `consentPeriod` |
| 17 | No blanks to be completed after signing | Rev. Proc. 2013-14 §5.04(4) | done | `CONSENT_NOT_FINAL` in production while `[...]` remain |
| 18 | SSNs to the e-file partner only after a valid consent | product promise in the notice | done | `shareTins`, test "SSNs reach the e-file partner only when..." |
| 19 | Expert Review: disclosure to a CPA or EA who gives substantive advice is outside 301.7216-2(d)(1) and needs a consent naming the firm | [301.7216-2(d)(1)](https://www.law.cornell.edu/cfr/text/26/301.7216-2), Rev. Proc. 2013-14 §5.04(1)(b) | gap (blocked on owner) | Form `us-7216-expert-review` is ready; the firm's name is a blank. Before `MYCA_US_EXPERT_REVIEW=1`, the hand-off must check `usConsents.valid(userId, EXPERT_REVIEW)` |
| 20 | Sharing a return with an invited tax pro is a taxpayer-directed disclosure and needs a written consent naming the recipient; a spouse on the same joint return does not | [301.7216-3(a)(1)](https://www.law.cornell.edu/cfr/text/26/301.7216-3), [301.7216-2(e)](https://www.law.cornell.edu/cfr/text/26/301.7216-2) | gap (counsel + engineering) | "Share with your spouse or tax pro" (`PeopleScreen`). Add a per-invite disclosure consent that names the invitee before an accountant invitation to a household is sent |
| 21 | Using return information for anything other than preparing the return (for example IRS-letter checks, withholding and estimates in MyCA Plus, or offering Plus based on the return) needs a use consent; a solicitation list may only offer tax return preparation services | [301.7216-2(n)](https://www.law.cornell.edu/cfr/text/26/301.7216-2), Rev. Proc. 2013-14 §5.04(1)(c) | counsel | Form `us-7216-plus-use` is ready but not enforced. Counsel decides whether Plus features are preparation; if not, gate `US_PLUS_TOOLS` on it. Never pick who sees a Plus offer from return figures without it |
| 22 | Anonymous statistics only in aggregates of 10+ returns | [301.7216-2(o)](https://www.law.cornell.edu/cfr/text/26/301.7216-2) | done | Funnel events (`cloud/src/growth.mjs`) carry step names, not return data |

### FTC (Gramm-Leach-Bliley)

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 23 | Safeguards Rule covers tax preparation firms: Qualified Individual, written risk assessment, access controls, encryption, MFA for anyone accessing customer information, secure disposal within two years of last use, change management, logging, annual pen test and six-monthly scans, training, vendor oversight, incident plan, yearly written report | [FTC guide](https://www.ftc.gov/business-guidance/resources/safeguards-rule-what-your-business-needs-know) | done (draft plan, most controls); owner (Qualified Individual, pen test, report) | WISP. The small-institution exemption (under 5,000 consumers) drops only some provisions; plan for full compliance |
| 24 | Notify the FTC within 30 days of discovering unauthorized acquisition of unencrypted customer information of 500+ consumers (encrypted counts as unencrypted if the key was taken); effective 13 May 2024 | [16 CFR 314.4(j), 88 FR 77499](https://www.govinfo.gov/content/pkg/FR-2023-11-13/html/2023-24412.htm) | done (plan) | WISP section 7 step 4 |
| 25 | Privacy Rule (Regulation P): initial privacy notice to customers; the annual notice is not needed when the institution shares only under the exceptions and has not changed its policy | [12 CFR 1016](https://www.ecfr.gov/current/title-12/chapter-X/part-1016), [FTC how-to](https://www.ftc.gov/business-guidance/resources/how-comply-privacy-consumer-financial-information-rule-gramm-leach-bliley-act) | counsel | The US notice is shown and accepted before any data is entered. Counsel to decide whether to also publish it in the Regulation P model-form layout |

### State privacy, breach and children

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 26 | CCPA/CPRA applies to a for-profit doing business in California with revenue over $26,625,000 (2025 adjustment), or buying/selling/sharing PI of 100,000+ consumers, or 50%+ revenue from selling PI. At launch MyCA is likely under every threshold | [CA AG](https://oag.ca.gov/privacy/ccpa), [CPPA thresholds](https://www.cppa.ca.gov/regulations/cpi_adjustment.html) | counsel (applicability) | Built as if it applies: notice, in-app export and deletion, 45 days |
| 27 | CCPA's GLBA exemption is for information collected under GLBA, not for the business: sign-in, device, crash and marketing data stay in scope | [CCPA statute §1798.145(e)](https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf) | done | Notice covers every category, not only the return |
| 28 | Notice at collection, rights to know, delete, correct, opt out of sale/sharing, limit sensitive PI; "Limit the use" link only when sensitive PI (SSN) is used beyond the permitted purposes | [CCPA regulations](https://www.cppa.ca.gov/regulations/pdf/cppa_regs.pdf) | done | Notice states SSNs are used only to provide the service and nothing is sold or shared, so no links are needed. Any future ad SDK changes this |
| 29 | Other comprehensive state laws: about 19 in force; Indiana, Kentucky and Rhode Island since 1 Jan 2026; Connecticut's 2026 amendment reaches anyone processing sensitive data; Maryland (35,000 residents) since Oct 2025. Most use 35,000-100,000 resident thresholds and exempt GLBA financial institutions at entity level, while some (for example Oregon and Minnesota, and California's CCPA) exempt only GLBA-covered data | [IAPP 2026](https://iapp.org/news/a/new-year-new-rules-us-state-privacy-requirements-coming-online-as-2026-begins), [Kelley Drye calendar](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/mark-your-calendars-upcoming-compliance-dates-in-state-privacy-laws) | counsel | The notice gives the same rights to everyone, which covers the common denominator. Counsel to confirm Connecticut (sensitive data, no threshold from 1 July 2026) and Oregon/Minnesota (data-level GLBA exemption) |
| 30 | State breach notification (all 50 states; California §1798.82 names SSN; several states also need the attorney general); notify state tax agencies through the Federation of Tax Administrators | [Cal. Civ. Code §1798.82](https://california.public.law/codes/ca_civ_code_section_1798.82) | done (plan); owner (counsel's state matrix) | WISP section 7 step 3 |
| 31 | COPPA: no collection from children under 13 without verifiable parental consent; 2025 amendments | [COPPA final rule amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments), [COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) | done (notice); gap (store) | Notice: adults 18+, a child's details only as a parent's dependent. Set the Play target audience to 18+ and the App Store age rating accordingly; do not target the listing at teens |

### Accessibility and e-signature

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 32 | ADA Title III: DOJ expects public-facing web and apps to be accessible; WCAG 2.1 AA is the working standard (Title II's rule names it for governments) | [DOJ guidance](https://www.ada.gov/resources/web-guidance/), [WCAG 2.1](https://www.w3.org/TR/WCAG21/) | gap (UI lane) | Screen-by-screen review is the UI lane's. For this lane: the fee, the consent text and the 8879 declaration must be real text (not images), reach 4.5:1 contrast, scale with system font size, and be read in order by TalkBack/VoiceOver |
| 33 | Fee disclosure accessible and shown before payment: launch price and list price as text, with a semantics label that reads the whole price line | FTC Act §5; WCAG 1.4.3, 1.3.1 | gap (UI lane) | `UsFilingFeeCard` (`mobile/lib/us/`). Check the price line is announced as one sentence ("$99 launch price, list price $129") |
| 34 | E-SIGN Act: an electronic signature is valid; for records the law requires in writing, the consumer's consent to electronic records and the hardware/software disclosure | [15 U.S.C. 7001](https://www.law.cornell.edu/uscode/text/15/7001) | done (8879 via IRS-prescribed PIN methods; 7216 by Rev. Proc. §6); counsel (whether the consent copy must be offered as a download) | `us-7216.mjs` keeps the exact text; add "Save a copy" to the consent screen |

### Google Play

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 35 | Account deletion in the app (easy to find) and on the web without reinstalling; the web page names the app or developer as on the listing; say what is kept and why | [Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111) | done in the API; gap (UI, site) | `DELETE /v1/me` and the purge. In the US app it is under Account > "Switch or add" > Delete my account: add "Delete account" to the US account sheet. `deploy/public/delete-account.html` must say MyCA US and the three-year e-file exception (BRAND lane) |
| 36 | Data safety: Government ID, financial info, name/email/phone, photos and files, device IDs, app activity, crash logs; encrypted in transit; deletion link. Service providers and user-initiated transfers are not "sharing" | same page; Data safety form | gap (owner fills the form) | `docs/release/PLAY-LISTING-US.md` table corrected (device IDs added, sharing column follows Play's definitions) |
| 37 | Financial features declaration: tax filing has no category of its own; choose "Other" under Support services and describe it | [Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271) | owner | PLAY-LISTING-US |
| 38 | Payments: Play Billing is no longer required for US users since 29 October 2025 (Epic injunction); the alternative billing and external links programs carry reporting and fees from 1 October 2026. Outside that, the Payments policy has no tax-filing exception, so a card fee for the return relies on the US rule | [US Play changes](https://support.google.com/googleplay/android-developer/answer/15582165), [Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738) | owner | Card checkout for the $99/$129 return is allowed for US users; enrol in the alternative billing program if card checkout stays inside the app, and keep the Play product as the in-app path. Plus is a Play subscription already |

### Apple App Store (when the iOS build ships)

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 39 | 5.1.1(v) in-app account deletion; regulated fields may confirm by support; tell users what is kept; subscriptions: tell them billing continues through Apple | [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app) | gap (iOS) | Same API |
| 40 | 4.8: an app that uses Google sign-in must also offer a login that limits data to name and email, lets the email be hidden, and does not track; Sign in with Apple meets it | [App Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/) | gap (iOS) | Add Sign in with Apple (and token revocation on deletion) before App Store submission |
| 41 | 5.1.1(ix): a financial app must be submitted by the legal entity that provides the service | same | owner | Submit under the US company's developer account |
| 42 | 3.1.1/3.1.3: a digital service unlocked in the app uses in-app purchase; the US storefront has allowed external purchase links since May 2025 | same; [Epic order coverage](https://www.macrumors.com/2025/05/01/apple-updates-u-s-app-review-guidelines-epic/) | counsel | Decide IAP versus an external link for the return fee on iOS |
| 43 | Privacy nutrition labels match Data safety | App Store Connect | owner | PLAY-LISTING-US table |

### Subscriptions and advertising

| # | Requirement | Source | Status | Where |
|---|---|---|---|---|
| 44 | California automatic renewal law (as amended by AB 2863, from 1 July 2025): clear terms before the subscription in visual proximity, express consent to the renewal, an acknowledgment with how to cancel, online cancellation, notice of price changes, and a yearly reminder for yearly plans. The FTC's click-to-cancel rule was vacated (8th Cir., July 2025); ROSCA still applies | [BPC 17602](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602), [AB 2863](https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=202320240AB2863), [8th Cir. vacatur](https://perkinscoie.com/insights/update/eighth-circuit-vacates-ftc-negative-option-rule-whats-next) | done (terms on screen); gap (acknowledgment email and yearly reminder for card subscribers) | `us_plus_screen.dart`. Play sends its own receipts and lets users cancel in Play; for Stripe Plus, send the acknowledgment email with how to cancel, and the yearly renewal reminder; counsel to confirm the timing |
| 45 | "Free": only when the consumer can really get it free; qualifiers next to the claim. The FTC found TurboTax's "free" ads deceptive (2024) | [16 CFR 251](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-251), [FTC v. Intuit opinion](https://www.ftc.gov/news-events/news/press-releases/2024/01/ftc-issues-opinion-finding-turbotax-maker-intuit-inc-engaged-deceptive-practices) | done (listing) | The listing says "Preparing, checking and downloading your return is free. You pay once, only when you file." Never use "free" in an ad, headline or short description without that sentence beside it; never "file free" |
| 46 | Endorsements and reviews: disclose material connections, no fake or bought reviews, testimonials show typical results | [16 CFR 255](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255), [Reviews rule](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers) | owner (marketing) | No reviews or endorsements exist yet. Waitlist and Expert Review copy must say "coming" and not imply a CPA checks returns today |
| 47 | Refund and guarantee wording: say exactly what is refunded and when; no "maximum refund guaranteed" or "accuracy guaranteed" without a written guarantee policy | FTC Act §5 | done (none made) | Keep any refund promise to "If the IRS rejects your return and we cannot fix it, we refund the filing fee" only once billing implements that refund |
| 48 | IRS name: do not imply IRS endorsement; "IRS-authorized e-file provider" only for the partner until MyCA has its EFIN | [Pub 1345 Advertising Standards (p.34, pointing to Pub 3112)](https://www.irs.gov/pub/irs-pdf/p1345.pdf) | done | PLAY-LISTING-US "What the text may and may not promise", "not affiliated with the IRS" |

### Code checks

| # | Check | Status | Where |
|---|---|---|---|
| 49 | SSNs never logged | done | Request log has path only; error stacks and all fields now redacted (`server.mjs`); audit metadata redacted (`books-runner.mjs`); crash reports redacted (`crash-reports.mjs`); model requests redacted (`model-adapter.mjs`) |
| 50 | SSNs sealed at rest, last four only on screen | done | `platform/src/us-identity.mjs`, `mobile/lib/us/tin.dart` |
| 51 | Privacy notice accepted before any data; new version asks again | done | `consent.mjs`, the version bump to `.2` re-asks |
| 52 | Consent records versioned and attributable | done | `consents` (privacy, with device), `us_7216_consents` (text, hash, device, period, withdrawal) |
| 53 | 7216 consent kept after the account is erased | counsel | Rows go with the user row 30 days after deletion. If counsel wants consent evidence kept for the disclosure's limitation period, move them to a tombstone keyed by the household |
| 54 | Joint returns: the spouse's SSN is also disclosed under the filer's consent | counsel | The spouse is a taxpayer too. Either the spouse signs the same form (a second signer on the screen) or the spouse's SSN is left out of the prefill |

## Screens owed (UI lane, kept small)

1. **Consent screen** for each form from `GET /v1/me/us-consents`: the whole `text` on one screen in body-size
   type, a "valid until" date picker (default one year), an empty "Type your full name to sign" field (never
   prefilled), Sign, and "Save a copy". Posts `{document, version, signedName, validUntil}`. Errors:
   `SIGNATURE_REQUIRED`, `CONSENT_CHANGED` (reload), `CONSENT_NOT_FINAL` (show the hint).
2. **Sign and e-file, partner view** (`us_sign_screen.dart` `_partnerView`): a choice "Fill in my Social
   Security numbers on the partner's screen for me" that opens the consent screen; if declined, keep today's
   "there you only add your SSN". Show "Withdraw" under Security.
3. **Two-step before signing**: on `SECOND_STEP_REQUIRED` from propose or confirm, show the hint and a button
   to `SecurityScreen`.
4. **Account sheet** (`us_return_home_screen.dart` `_account`): add "Delete account" pointing at the existing
   flow in `BusinessesScreen`.
5. **Privacy notice screen**: the crash-report subtitle says "GSTINs" on the US app; use "names, amounts and
   Social Security numbers removed" when the edition is US.

## Owner and counsel list

- Fill the three notice blanks (US company, partner, privacy contact) and the consent blanks (the same company,
  the Expert Review firm), then counsel signs off the notice, the three consent forms and the WISP.
- Name the Qualified Individual and the incident contact; get a privacy seal vendor, an EV certificate, an
  ASV for weekly scans, and a US registrar with the domain locked (needed for MyCA's own route in 2028).
- Keep India-based staff out of the US production project (7216 outside-the-US rule).
- Decide: two-step sign-in at US account creation (Pub 1345 "MFA before reaching stored tax data").
- Decide with counsel: Plus as preparation or as a use needing consent; tax-pro sharing consent; joint-return
  SSN consent; consent record retention after erasure.
- Store forms: Data safety, financial features ("Other"), target audience 18+, the web deletion link, and for
  iOS Sign in with Apple and the entity account.
