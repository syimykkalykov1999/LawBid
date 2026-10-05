## Owner 2026-10-05 — attorney trust levels

- One-step self-attested registration stays; what an attorney may do grows
  with what was confirmed: `attorney_profiles.trust_level` 0–3 (self-declared,
  registry, identity, documents) and `trust_badge`; facts and history in
  `attorney_trust` / `attorney_trust_events`.
- Gates (settings `trust.min_level_bids` 0, `trust.min_level_payments` 2,
  `trust.min_level_badge` 2): 403 `TRUST_LEVEL_REQUIRED` / `ATTORNEY_ON_HOLD`
  on bids; `AttorneyTrustService.paymentsGate` for in-app payments.
- Identity via Stripe Connect: individual account → legal name vs profile and
  registry; company account → representative / owners (never company.name);
  no match → firm link (registry firm == company name, or a code to an
  address on the firm's domain, or staff with letterhead + bar card + ID).
- Automatic holds (each a switch): fraud/impersonation complaint from a
  client who dealt with the attorney (two distinct → suspended), Stripe name
  mismatch, duplicate bar-number claim (`registry_flag` `duplicate_claim`);
  payout delay `trust.payout_delay_days` until `trust.payout_delay_until_level`.
- API: `GET /trust/me`, firm-email code, `GET /trust/attorneys/:id`;
  admin `/admin/trust/*` (settings, stats, holds, card, confirm/hold/release,
  recompute). Daily `trust.recompute` job.
- Admin: Верификация → «Уровни доверия» + trust panel on the attorney card.
  App: level chip + "what was checked" sheet, own trust screen with firm
  email flow, pre-payment notice, report reason `fraud`.
- Docs: `docs/ATTORNEY_TRUST.md`; Terms clause on the site (lawbidsite).
