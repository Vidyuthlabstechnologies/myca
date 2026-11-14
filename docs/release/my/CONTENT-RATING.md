# MyCA Malaysia: content rating and app content declarations

For the Play Console "App content" section of `com.mldynamic.myca.my`. Drafted 14 November 2026.

## IARC content rating questionnaire

| Question | Answer |
|---|---|
| Category | Utility, productivity, communication or other |
| Violence, blood, sexual content, nudity, profanity, drugs, alcohol, tobacco, gambling, horror | No to every question |
| Does the app let users interact or exchange content with each other? | Yes, limited: members invited to the same business see each other's entries. No public chat, no strangers |
| Does the app share the user's current physical location? | No |
| Does the app allow purchases of digital goods? | Yes (Play subscriptions) |
| Does the app contain AI-generated content? | Yes: Ask Bahi answers in text (see below) |
| Unrestricted internet access (browser)? | No; links open the system browser to official sites |

Expected result: rated for everyone (in Malaysia Play shows the IARC generic rating, typically
"Rated for 3+" / "Everyone"). Record the certificate id in Play Console.

## Other app content declarations

| Declaration | Answer | Notes |
|---|---|---|
| Target audience | 18 and over | Not designed for children; not in Families |
| Ads | No ads | |
| Government apps | **No**. MyCA is not a government app and does not represent LHDN or Customs | The listing carries the "not affiliated" sentence |
| Financial features | Answer that the app provides accounting, invoicing and tax preparation tools; it does not offer loans, earned wage access, trading, banking, payments or crypto. If the form has no "accounting / tax software" option, choose "My app doesn't provide any financial features" only after reading the current form text, and keep a screenshot | Google's Financial Services policy lists loans, EWA and binary options; accounting is not named: https://support.google.com/googleplay/android-developer/answer/9876821 (accessed 2026-11-14) |
| Health apps | No | |
| News apps | No | |
| Data safety | `DATA-SAFETY.md` | |
| Account deletion | Yes, in app and on the web | URL required |
| App access (for review) | Provide a reviewer login on a demo business with sample data, and say MyInvois is in the sandbox for that login | Reviewers cannot use real LHDN credentials |

## AI-generated content (Ask Bahi)

Google Play's AI-Generated Content policy requires apps with generative AI to let users **report
or flag offensive content inside the app** and to use the reports to improve filtering.
Source: https://support.google.com/googleplay/android-developer/answer/13985936 (accessed 2026-11-14).

- [ ] Build: a "Report this answer" action on each Bahi answer (long-press menu and a small flag
      icon), sending the message id and a reason to the server. Check whether the shared chat
      screen already has it; if not, it is a launch blocker for every country.
- Bahi refuses requests outside accounting and tax, and never generates images.
