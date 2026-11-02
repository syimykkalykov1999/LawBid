# Security policy

## Reporting a vulnerability

Email **support@lawbid.dev** with the subject `SECURITY`. The same address is
published in `https://lawbid.dev/.well-known/security.txt` (RFC 9116).

Please include what you found, how to reproduce it, and the account or
environment you used. Use only test accounts. Do not read, change or delete
other people's data, do not run load or denial-of-service tests, and do not
use social engineering against staff or users.

We acknowledge a report within 3 business days and aim to fix a confirmed
high or critical issue within 30 days. We do not take legal action against
good-faith research that follows these rules. There is no paid bug bounty yet;
we credit reporters who want it.

## In scope

`api.lawbid.dev`, `admin.lawbid.dev`, `lawbid.dev` and the LawBid iOS and
Android apps.

## Out of scope

Third-party services (Stripe, Twilio, Bunny, Cloudflare, AWS), missing
best-practice headers without a working attack, and reports from automated
scanners without a proof of impact.

## Our own checks

CodeQL, Trivy, gitleaks and `npm audit` run on every change; the image SBOM
(SPDX) is attached to each release (see `.github/workflows/deploy.yml`).
