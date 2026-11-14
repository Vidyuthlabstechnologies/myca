# MyCA UK privacy notice

Draft `uk-draft-2026-11-14`, for review by a UK solicitor. Not yet published. Written to meet the
UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018 and the Privacy and
Electronic Communications Regulations 2003 (PECR), as amended by the Data (Use and Access) Act 2025.
Square brackets are blanks to fill before publishing.

---

## 1. Who we are

MyCA UK is a bookkeeping and Making Tax Digital app for sole traders, landlords, small businesses
and their accountants in the United Kingdom.

The controller of your personal data is **[UK entity to confirm]**, registered in [England and
Wales / Scotland] under company number [number], registered office [UK entity to confirm].
ICO registration number: [number].

[If the controller is not established in the UK: Our UK representative under Article 27 UK GDPR is
[name and address].]

Data protection contact: [privacy@ address], or write to us at the registered office. We aim to
reply within one month.

MyCA UK is built for Making Tax Digital and HMRC recognition is in progress. MyCA is not part of
HMRC or any government body.

## 2. The short version

- Your records are stored in the United Kingdom, on Google Cloud in London.
- We use your data to keep your books, work out your figures and send what you approve to HMRC.
  Nothing is sent to HMRC until you approve it.
- We never ask for, see or keep your HMRC sign-in details. You connect MyCA to HMRC on HMRC's own
  page, and HMRC gives us a time-limited permission that we store encrypted.
- We never sell your data or use your financial records for advertising.
- The AI assistant only chooses which of MyCA's tools to run. It does not make up figures, and it
  does not decide anything about you.
- You can export all your records, or ask us to delete them, at any time from the app.

## 3. What we collect

| Category | Examples | Where it comes from |
|---|---|---|
| Account details | Name, email address, mobile number, Google account id, sign-in and two-step settings | You, Google sign-in |
| Business and tax identifiers | Trading name, business address, Unique Taxpayer Reference (UTR), National Insurance number (NINO), VAT registration number (VRN), Companies House number, accounting period, whether you are in Scotland | You; HMRC (business details) once you connect |
| Financial records | Income and expenses, invoices, receipts, bank statement lines, property income and costs, VAT figures, quarterly updates, estimates and the figures you approve | You, files you upload, statement imports and bank feed providers you connect |
| Information from HMRC | Your obligations and deadlines, submitted returns and updates, HMRC's tax calculations, liabilities and payments, penalty points, submission receipts | HMRC, through its APIs, after you connect |
| HMRC connection permission | The OAuth access and refresh tokens HMRC issues to MyCA | HMRC |
| Fraud prevention data | Device id created by the app, device make and model, operating system and version, screen and window size, time zone, local and public IP addresses and port, your MyCA user id, two-step sign-in method and time | Your device and our servers, see section 6 |
| Messages to the assistant and to support | What you type or say, attachments you add | You |
| Payments | Plan, trial and renewal dates, Google Play order id, Stripe payment reference (for the Self Assessment return fee). We do not receive your full card number | Google Play, Stripe |
| People you invite | Name and contact details of an accountant or staff member you add | You |
| Technical and security data | Request logs, crash reports (with no names, amounts or numbers), the record of who opened which books | Our servers and the app |
| Marketing preferences | Whether you agreed to product and offer emails | You |

We do not ask for special category data (such as health, religion or trade union membership).
Bank statement lines can sometimes reveal it (for example a donation or a union subscription). We
store such lines only as part of your books, do not analyse them for those traits, and never use
them for anything other than your accounts.

## 4. Why we use it, and our lawful basis

| Purpose | Data | Lawful basis (UK GDPR Article 6) |
|---|---|---|
| Create and run your account, sign you in, keep it secure | Account details, technical data | Contract (Article 6(1)(b)) |
| Keep your digital records and books, categorise transactions, produce reports | Financial records, business identifiers | Contract |
| Check your UTR, NINO and VRN are in a valid format before use | Business and tax identifiers | Contract |
| Connect to HMRC, read your obligations and calculations, send the VAT returns, quarterly updates and final declaration you approve | HMRC data, tokens, financial records, identifiers | Contract; and, for the records HMRC requires you to keep digitally, to help you meet your legal obligation |
| Send HMRC the fraud prevention data it requires with every MTD call | Fraud prevention data | Legal obligation (Article 6(1)(c)), as HMRC requires software to send it for MTD VAT and MTD Income Tax. **Check before publishing** the exact legal source; legitimate interests (preventing fraud against you and HMRC) is the fallback basis |
| Estimate your tax (Self Assessment, Class 4 National Insurance, student loan, High Income Child Benefit Charge, payments on account) | Financial records, identifiers, your answers | Contract |
| Remind you of deadlines and penalty points | HMRC data, account details | Contract |
| Answer your questions through the AI assistant | Your messages, the results of the tools it runs | Contract |
| Let an accountant or staff member you invite work on your books | Their details, your books | Contract (with you); legitimate interests (for the person you invite) |
| Take payment for your plan or the Self Assessment return fee | Payment records | Contract |
| Prevent fraud and abuse, investigate security incidents, keep an audit trail | Technical data, audit trail, fraud prevention data | Legitimate interests (Article 6(1)(f)): keeping your account and HMRC submissions safe |
| Fix errors and improve MyCA | Crash reports, aggregated usage counts with no financial detail | Legitimate interests: making the service work reliably |
| Keep records of what was sent to HMRC, and defend legal claims | Submission receipts, audit trail | Legitimate interests; legal obligation where a law requires it |
| Send product news and offers by email | Email, marketing preferences | Consent (PECR regulation 22), which you can withdraw at any time |
| Service emails (trial ending, renewal, a filing deadline, a security alert) | Email, account details | Contract; these are not marketing |

Where we rely on legitimate interests, we have weighed them against your interests and rights.
You can ask us for that assessment.

### Automated decisions

We do not make decisions about you based solely on automated processing that have legal or
similarly significant effects. The tax figures come from fixed rules that you can see and check.
The AI assistant picks which tool to run; it never produces a figure itself and never sends
anything to HMRC. Every submission needs your approval.

## 5. Your HMRC data

- You connect MyCA to HMRC yourself, on HMRC's sign-in page (OAuth 2.0). We never see or store your
  Government Gateway user id or password.
- HMRC gives MyCA a permission (access token) that lasts a short time and a refresh token that lets
  us renew it. Both are encrypted at rest with AES-256 and held only in the UK.
- We call HMRC only to do what you asked: read your obligations, calculations and liabilities, and
  send what you have approved.
- You can disconnect at any time in the app, which deletes the tokens on our side. You can also
  remove MyCA's access from your HMRC online account. **Check before publishing** the exact path in
  HMRC's online services.
- HMRC is a separate controller of the data it receives. See HMRC's own privacy notice on GOV.UK.

## 6. Fraud prevention data sent to HMRC

HMRC requires software to send information about the device and connection with every Making Tax
Digital request, to help protect you and HMRC from fraud. For MyCA UK this is: the connection type
(mobile app through our server), a device id MyCA creates on your phone, your phone's local IP
addresses, your public IP address and port, screen and window size, time zone, operating system,
make and model, your MyCA user id, how and when you last completed two-step sign-in, our product
name and version, and the addresses of our servers. The full list and why each item is needed is
in our fraud prevention data page [link].

We send it only to HMRC, only with HMRC requests, and keep a copy with the submission record (see
section 9). We tell you about it before you first connect to HMRC.

## 7. Who we share it with

We share personal data only as needed to run MyCA:

| Recipient | Why | Location |
|---|---|---|
| HMRC | The returns, updates and fraud prevention data you send, and the requests that read your HMRC data | United Kingdom |
| Google Cloud (Google Cloud EMEA Limited) | Hosting, database, storage, backups, as our processor | London, United Kingdom (`europe-west2`) |
| AI model provider [provider to confirm] | Processes assistant messages to choose a tool; no training on your data | [region to confirm]; see section 8 |
| Email delivery provider [provider to confirm] | Sends service emails | [region to confirm] |
| Bank feed provider [provider to confirm, only if you connect a bank] | Reads your bank transactions with your permission; it is authorised by the Financial Conduct Authority | [region to confirm] |
| Google Play | Takes payment for subscriptions bought in the app | Google's global systems |
| Stripe | Takes card payment for the Self Assessment return fee | [Stripe entity and region to confirm] |
| People you invite | Your accountant or staff see the books you share, by the role you give them | Wherever they are |
| Professional advisers, insurers, auditors | Under confidentiality, when needed | United Kingdom or under section 8 safeguards |
| Police, courts, regulators | Only where the law requires it | United Kingdom |
| A buyer of our business | If MyCA is sold, under the same promises | To be notified to you |

Each processor works under a written contract that limits what it may do with your data.

## 8. International transfers

Your stored records, HMRC data and tokens are kept in the United Kingdom (Google Cloud London).
We do not plan to move them out of the UK.

Some services we use may process limited data outside the UK. Before launch we will either keep
each of them in the UK or put a lawful safeguard in place, and list them here:

- [AI model provider: region to confirm. If outside the UK, the safeguard: UK adequacy regulations,
  the UK Extension to the EU-US Data Privacy Framework, or the International Data Transfer
  Agreement.]
- [Support and engineering access from outside the UK, if any: our group company in India under an
  International Data Transfer Agreement with a transfer risk assessment.]
- [Payment providers: Google Play and Stripe, under their own transfer safeguards.]

You can ask us for a copy of the safeguard used.

## 9. How long we keep it

In short:

- **Your books and records**: while your account is open. HMRC requires you to keep your business
  and property records for at least 5 years after the 31 January submission deadline of the tax
  year they relate to (longer for VAT records; **check before publishing**: 6 years). Before you
  close your account we remind you to export them. If you ask us to delete them, we delete them 30
  days later.
- **Submission records** (what was sent to HMRC, when, by whom, HMRC's receipt and the fraud
  prevention data sent with it): 6 years after the submission, so that you and we can answer any
  HMRC question about it. **Check before publishing.**
- **HMRC tokens**: until you disconnect, or 30 days after your account closes, whichever is first.
- **Logs and crash reports**: 90 to 365 days.
- **Payment records**: 6 years, for our own accounts.

The full schedule is in our retention policy [link].

## 10. Your rights

You have the right to:

- **access** a copy of your personal data;
- have inaccurate data **corrected**;
- have your data **erased**, where we have no overriding reason to keep it;
- **restrict** how we use it;
- **data portability**: receive your records in a common, machine-readable format (CSV and JSON
  from the app's export);
- **object** to processing based on legitimate interests, and to direct marketing at any time;
- **withdraw consent** where we rely on it, without affecting what was done before;
- not be subject to a solely automated decision with legal or similarly significant effects.

Most of these you can do in the app: export, correct, disconnect HMRC and delete your account.
For anything else, contact us (section 1). We reply within one month, which can be extended by two
months for complex requests. It is free unless a request is clearly unfounded or excessive.

Erasing your records does not remove what has already been sent to HMRC. HMRC holds that as its
own controller.

## 11. Complaints

Please tell us first, at [privacy@ address], and we will try to put it right. You also have the
right to complain to the Information Commissioner's Office:

Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF.
Telephone 0303 123 1113. Website ico.org.uk/make-a-complaint. **Check before publishing** that
these details are current.

## 12. Children

MyCA UK is for people aged 18 and over who run a business, let property or work in an accounting
firm. We do not knowingly collect data from children. If you think a child has given us their data,
contact us and we will delete it.

## 13. Security

Data is encrypted in transit (TLS 1.2 or above) and at rest (AES-256). Access is by role (owner,
accountant, staff), every change is recorded in an audit trail, and staff access to production is
limited to named people. Our group holds ISO 27001 certification and a SOC 2 report; [Cyber
Essentials status to confirm]. If a breach puts your data at risk, we will tell you without undue
delay.

## 14. Changes

We will tell you in the app and by email before any change that matters takes effect. The version
and date are at the top of this notice.
