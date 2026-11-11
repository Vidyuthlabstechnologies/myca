# Security policy

## Reporting a vulnerability

Please report it privately, never in a public issue or pull request:

- Open a private advisory: [Report a vulnerability](https://github.com/Vidyuthlabstechnologies/myca/security/advisories/new), or
- email the company's security contact listed on the MyCA website.

Say what you found, how to reproduce it, and what an attacker could do with it. Do not
use real customers' data to prove it: sign up and use a demo business.

## What we will do

| | Target |
|---|---|
| Acknowledge the report | 2 working days |
| First assessment and severity | 5 working days |
| Fix for a critical or high issue | 14 days, or sooner if it is being exploited |
| Fix for a medium issue | 45 days, or a written risk acceptance by the owner |
| Tell you when it is fixed | On release, with credit if you want it |

We will not take legal action against research done in good faith within these rules:
no data destruction, no service disruption, no access to other people's books beyond
what proves the issue, and no public disclosure before a fix ships or 90 days pass.

## Supported versions

| Component | Supported |
|---|---|
| Hosted API | The version running in production; fixes are deployed, not backported |
| Android app | The latest release on Google Play and the one before it |
| Desktop app | The latest release |

## Scope

In scope: the hosted API (`cloud/`), the engine (`platform/`), the Android app
(`mobile/`), the email relay (`email-relay/`) and the website (`deploy/`).
Out of scope: third-party services MyCA connects to (the GST portal, GSPs, NIC, payment
providers), denial of service, and social engineering.

When something has already gone wrong, follow
[`docs/operations/INCIDENT-RESPONSE.md`](docs/operations/INCIDENT-RESPONSE.md).
