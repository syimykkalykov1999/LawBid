# LawBid Legal TODO

Companion to `LEGAL_REGISTER.md` (2026-10-25). Not legal advice. Packages are written so that **no two packages touch the same file**, so they can run in parallel. "UI" items are only flagged: the owner has frozen the app look, so each UI-touching item needs his explicit yes.

Priority: P0 = before public launch / ads; P1 = first month; P2 = when scale or the feature turns on.

## Rule for legal texts

All legal texts live in the legal-documents module (versioned, 10 languages, admin publishes). Do **not** put new legal prose in code. Short texts that are not whole documents go into `legal.settings` (`apps/api/src/modules/legal/legal.settings.ts`, today only en and ru; extend to the 10 locales in package L-TEXT).

Document types today: terms, privacy, attorney_agreement, client_agreement, eula, disclaimer, client_contact_sharing, refund, cookies, third_party_services, partner_terms, dmca_policy, accessibility. Needed new types (enum + labels in `legal-documents.constants.ts`, Prisma enum migration): **community_guidelines, advertising_disclosure, sms_terms**. Drafts for all are in `docs/legal/drafts/`.

## Packages

### P-TEXT (P0): load the new texts, no code logic
Files: `apps/api/assets/legal/*.md` (only the new/updated files, e.g. `community_guidelines.en.md`, `advertising_disclosure.en.md`, `sms_terms.en.md`, and replacement of the existing ones from `docs/legal/drafts/`), `apps/api/src/modules/legal-documents/legal-documents.constants.ts` (3 new types and titles), `apps/api/prisma/schema.prisma` (enum `LegalDocType` + migration file), `scripts/legal-translate.mjs` (add new types to the list). Then admin reviews and publishes; machine translations stay "draft" until a human checks them. Admin-editable: yes (that is the point).

### P-ETH-1 (P0): wording audit, no "recommendation" language
Files: `apps/api/src/modules/attorney-trust/**` (names of levels in API responses only), `apps/api/assets/legal/terms.en.md` s.3 (via P-TEXT, not in this package), i18n strings of the badge names under `apps/api/src/modules/i18n/**`. Goal: replace "verified / vetted / top / best / recommended" with "license checked against the state registry on DATE"; no superlatives. UI strings need owner approval. Admin-editable: badge labels should be i18n keys editable in admin.

### P-ETH-2 (P0): paid placement labels
Files: `apps/api/src/modules/promotions/promotions.service.ts` + DTO (return a `sponsored: true` flag and the label text key), `apps/api/src/modules/search/**` (never mix paid rank into "relevance" without the flag). UI display of the label = owner decision. Label text and per-state disclaimer text: admin-editable setting in `legal.settings` (add field `attorneyAdvertisingLabel`, `priorResultsDisclaimer`, 10 locales) via package L-TEXT.

### P-ETH-3 (P0): hard guard against percentage fees
Files: `apps/api/src/modules/case-payments/case-payments.settings.ts` (validation: `application_fee_amount` must be flat, never a percent of the case amount; reject percent on save), `apps/api/src/modules/admin-config/**` only if the setting is written there (otherwise skip). Admin gets a visible warning text. Owner keeps 0.

### P-ETH-4 (P1): who may start a chat with a client
Files: `apps/api/src/modules/chat/chat.service.ts` (read-only review first; fix only if an attorney can message a client who has not posted a case, asked a question or replied to a bid; that is solicitation, Rule 7.3), `apps/api/src/modules/bids/**` (conflict decline path).

### P-ETH-5 (P1): Q&A and review labels
Files: `apps/api/src/modules/legal-qa/legal-qa.service.ts` (return `chosenBy: 'asker'` metadata, no auto "Top" badge from best-answer counts), `apps/api/src/modules/reviews/review-moderation.service.ts` (moderation rejects only on neutral grounds, never by star value; log reason code), `apps/api/src/modules/reviews/reviews.service.ts` (an attorney reply warning key). Texts admin-editable.

### P-CONSUMER-1 (P0): subscription consent, acknowledgment, renewal reminder
Files: `apps/api/src/modules/billing/**` (consent record: timestamp, IP, plan, price, renewal terms, text version stored; California requires 3-year retention), `apps/api/src/modules/subscriptions/**` (reminder job before annual renewal, cancel path in-app), `apps/api/src/modules/admin-email-templates/**` seeds only (acknowledgment email and reminder email text, editable in admin). Mobile checkbox/consent line = UI change, owner decision.

### P-CONSUMER-2 (P1): reviews rule compliance
Files: `apps/api/src/modules/client-reviews/**`, `apps/api/src/modules/rewards/rewards.rules.ts` (assert rewards never depend on review submission/sentiment), tests only. Add admin report "reviews hidden by reason" so we can show neutral criteria.

### P-PRIV-1 (P0): data map, SDK list, age gate
Files: `docs/legal/data-map.md` (new, owner/lawyer file), `apps/api/src/modules/auth/auth.service.ts` + DTO (require `confirm18: true` at registration and store the flag + timestamp), `apps/api/src/modules/users/**` (store `age_confirmed_at`). Mobile checkbox = UI change, owner decision. Texts admin-editable.

### P-PRIV-2 (P0): admin access to private content: rules and logging
Files: `apps/api/src/modules/admin-access/audit-log.service.ts` (new action type `chat.read` with reason), `apps/api/src/modules/admin-cases/**` and `apps/api/src/modules/admin-content/**` (every endpoint that returns message bodies must require a reason and call the audit log), `apps/api/src/modules/admin-auth/admin-permissions.ts` (new permission `read_private_content`, off by default). Admin dashboard counter of reads. First step: grep all code that selects `body_original` or `body_display` and list the call sites.

### P-PRIV-3 (P1): encryption at rest for message bodies
Files: `apps/api/src/modules/chat/chat.service.ts` (encrypt `body_original` with a KMS-wrapped key), migration/backfill script `apps/api/scripts/**`. Large; ask owner before starting.

### P-PRIV-4 (P1): government requests policy
Files: `apps/api/src/modules/admin-data-requests/legal-export.service.ts` (content only with warrant / court order or user consent flag; record the document number), `apps/api/src/modules/admin-data-requests/legal-export.dto.ts`. Process doc: `docs/legal/government-requests.md` (new).

### P-PRIV-5 (P0): SDK hygiene (CIPA/wiretap)
Files: `apps/mobile/pubspec.yaml` (no change expected), `apps/mobile/lib/core/diagnostics/**` (confirm Sentry has no session replay or screenshot/text capture and scrubs PII; read only unless a defect is found), web app config under `apps/web/**` (analytics only after consent). Cookie notice text via P-TEXT.

### P-PRIV-6 (P1): biometrics check
Files: `apps/api/src/modules/verification/**`, `apps/api/src/modules/client-badge/client-badge.service.ts` (confirm whether any face/voice biometric is processed; if yes: written consent text, retention, BIPA policy). Output: a short note in the register.

### P-SEC-1 (P0): incident response plan with 30-day clock
Files: `docs/legal/incident-response.md` (new), `apps/api/src/modules/legal/legal.settings.ts` (incident contact already there; add `breachNoticeTemplate` text per locale). Contains: who decides, 72-hour internal target, 30-day NY notice, AG/DOS/State Police notice, consumer reporting agencies if over 5,000, other states as one standard, template letter (admin-editable), regulators list.

### P-PLAT-1 (P0): DMCA agent
Files: none in code (owner action: register at dmca.copyright.gov, $6, renew in 3 years); then set via admin `legal.settings.dmcaAgent` and republish the DMCA policy. Calendar reminder for renewal.

### P-PLAT-2 (P0): Take It Down 48-hour process
Files: `apps/api/src/modules/reports/**` (report reason `ncii`, priority queue, 48h timer and alert), `apps/api/src/modules/moderation/**` (hash block of identical copies), `apps/api/src/modules/media-moderation/**`. Notice text in Community Guidelines (P-TEXT). Admin-editable: the notice, and the contact address in `legal.settings`.

### P-PLAT-3 (P0): CSAM reporting (REPORT Act)
Files: `apps/api/src/modules/media-moderation/**` (confirm detection and escalation), owner action: register the ESP with NCMEC CyberTipline, 1-year preservation of reported material in `apps/api/src/modules/moderation/**`. Process doc `docs/legal/csam-reporting.md`.

### P-COMM-1 (P1): email compliance for outreach and marketing
Files: `apps/api/src/modules/outreach/**` (physical address + unsubscribe link + suppression list), `apps/api/src/modules/admin-email-templates/**` (footer template editable). Infra check of SPF/DKIM/DMARC and List-Unsubscribe: `infra/**` (read only first).

### P-COMM-2 (P2): marketing SMS (only when owner wants it)
Files: new `apps/api/src/modules/sms-marketing/**`, consent capture separate from OTP, quiet hours, STOP handling, consent log. Do not start without a lawyer: TCPA damages are $500-$1,500 per text.

### P-PAY-1 (P0): money-flow memo and stored value
Files: `docs/legal/money-flow.md` (new; diagram of who holds funds), `apps/api/src/modules/stars/stars.service.ts` (assert no cash-out path; read only unless found), `apps/api/src/modules/treasury/**` (read only: confirm it does not hold customer funds). Lawyer confirms exemption analysis.

### P-PAY-2 (P1): sales tax
Files: Stripe Tax enablement in `apps/api/src/modules/billing/stripe-payment.provider.ts` (tax calculation flag, config only), admin report of revenue by state in `apps/api/src/modules/admin-billing/**`. CPA decides registration.

### P-A11Y (P1): accessibility audit
Files: `docs/legal/accessibility-audit.md` (new findings list), `apps/web/**` fixes, mobile Semantics fixes in `apps/mobile/lib/**` (UI frozen: only invisible a11y labels, with owner OK). Statement text via P-TEXT.

### P-CONTRACT-1 (P0): acceptance evidence
Files: `apps/api/src/modules/legal-documents/legal-acceptance.service.ts` (store IP, user agent, doc hash, locale with each acceptance), `apps/api/prisma/schema.prisma` fields (coordinate with P-TEXT migration order: P-TEXT first; to avoid a shared file this package adds a **separate** migration folder and does not edit the enum line), tests.

### P-CONTRACT-2 (P1): mass-arbitration controls
Files: none in code; texts only in drafts (`terms` s.20 batching clause). Owner decides provider (AAA vs JAMS) with the lawyer.

### P-SANCTIONS (P2)
Files: `apps/api/src/modules/countries/**` (block embargoed regions at signup), `apps/api/src/modules/admin-sanctions/**` untouched. Screening of partner payouts: `apps/api/src/modules/partners/**` (SDN check before first payout). Policy text in Terms (P-TEXT).

### L-TEXT (P0): short legal texts in 10 languages
Files: `apps/api/src/modules/legal/legal.settings.ts` (extend `LEGAL_LANGS` from en/ru to the 10 locales; add fields: `attorneyAdvertisingLabel`, `priorResultsDisclaimer`, `bestAnswerNote`, `translationNote`, `reviewReplyWarning`, `caseCreate` extra confidentiality warning), `apps/api/src/modules/legal/legal.dto.ts`, `legal.service.ts`, `admin-legal.controller.ts` (just to accept new fields), `legal.settings.spec.ts`. Admin-editable by design.

## Which texts must be admin-editable (all of them)
Every document in `docs/legal/drafts/` (legal-documents module, versions, 10 locales) plus short texts in `legal.settings`: case form warning, unverified attorney note, support note, partner disclosure, advertising label, prior-results disclaimer, best-answer note, translation note, review reply warning, renewal acknowledgment and reminder emails (email templates module), breach notice template, NCII notice, DMCA agent block.

## Ask a real lawyer (checklist)
Engage a NY-licensed attorney with legal-ethics and platform experience (plus Illinois for the entity). Questions:

1. Do our attorney-facing pages, badges and "license checked" wording avoid being a "recommendation" under NYSBA 1132, 1213, 1271 and fit the safe harbor in NYSBA 1294? Please read 1294 against our real screens.
2. Is a flat subscription + bid-packs + boosts permissible for NY lawyers under Rules 5.4 and 7.2? Does a bid cost that varies by case category matter?
3. Which labels must a paid boost, a profile, a post and a bid carry in NY (Rule 7.1 "Attorney Advertising", prior-results disclaimer, office address)? Who is responsible, LawBid or the lawyer?
4. Does "best answer chosen by the asker" plus public Q&A create Rule 1.18 / UPL / advertising issues? Should answers carry a disclaimer?
5. Do document templates, AI or translation features risk UPL under Judiciary Law 478/484/495?
6. Privilege: is our admin-access design and disclosure enough for confidentiality under Rule 1.6 and the privilege? Should messages be encrypted so staff cannot read them?
7. Are we a lawyer referral service anywhere we operate? Which states have rules that catch lead-gen/bid platforms (NJ, CA, TX, FL, IL)?
8. Money transmission: confirm Stripe Connect flow exemption (FinCEN, NY, IL); Stars cash-out ban; trust account and Rule 1.15 for advance fees.
9. Subscriptions: NY GBL 527-a, California ARL, ROSCA review of our actual checkout, emails and cancellation path.
10. Arbitration: Illinois choice of law with NY consumers, mass-arbitration protections, AAA vs JAMS; attorney agreement terms.
11. Privacy: do any thresholds trigger CCPA or other state laws now; BIPA; CIPA; breach plan; government-request policy.
12. Children: age gate sufficiency for an 18+ service.
13. Review rules: moderation by neutral criteria, defamation takedown and subpoena handling.
14. Entity: SiMA LLC (Illinois) operating in NY: foreign registration, insurance (cyber, E&O).
15. Confirm texts in `docs/legal/drafts/` before publishing.
