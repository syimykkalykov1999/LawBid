## Owner 2026-10-05 — attorney trust levels

- One-step self-attested registration stays; what an attorney may do grows
  with what was confirmed: `attorney_profiles.trust_level` 0–3 (self-declared,
  registry, identity, documents) and `trust_badge`; facts and history in
  `attorney_trust` / `attorney_trust_events`.
- «Борьба с мошенниками»: switches `trust.require_registry` /
  `require_identity` / `require_documents` (+ `bids_require_cleared`); the
  badge and payments open when every enabled requirement is met or staff
  pressed «Подтвердить» (`attorney_trust.staff_cleared_at`, no re-checks).
  Staff queue `/admin/trust/queue`, `clear` / `unclear` /
  `request-documents` (templates) / `reject`, `bulk`. 403
  `TRUST_LEVEL_REQUIRED` {gate, missing} / `ATTORNEY_ON_HOLD` on bids;
  `AttorneyTrustService.paymentsGate` for in-app payments.
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
- Admin: Верификация → «Борьба с мошенниками» (queue, rules, holds) + trust
  panel on the attorney card.
  App: level chip + "what was checked" sheet, own trust screen with firm
  email flow, pre-payment notice, report reason `fraud`.
- Docs: `docs/ATTORNEY_TRUST.md`; Terms clause on the site (lawbidsite).
