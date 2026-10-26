## Owner 2026-10-05 — legal review follow-ups

- Outreach (Привлечение): consumer ("client") leads are off until the owner
  enables them and confirms the Do-Not-Call scrub; calls only inside the
  lead's local hours (per-state time zones, Florida 8–20); "do not
  contact" flag set by hand, by call outcome or by unsubscribe and never
  cleared by imports; a suppression list; mandatory source/consent note on
  every lead; at most N emails per lead with a cooldown;
  `List-Unsubscribe` headers; unconverted leads deleted after N days.
- DMCA: report reason `copyright`, formal notice (`POST /legal/dmca`),
  counter-notice, admin queue (Система → Право и жалобы) with
  remove / reject / restore, repeat-infringer strikes with auto-suspend.
- Legal texts editable in the admin (`legal.settings`): DMCA agent,
  incident contact, disclaimers shown in the app (case creation,
  unverified attorney before accepting a bid, support, partner
  disclosure, partner rules).
- Partners: rules must be accepted (version, time, IP) before joining;
  FTC disclosure shown and included in the share text; default client
  reward event is `case_published` (never "hired an attorney"); W-9
  required before the first payout.
- Site: Terms, Privacy, DMCA and Accessibility pages expanded as drafts
  for attorney review. Runbook `docs/runbooks/BREACH.md`.
- Review: /mnt/project-files/legal/us-liability-review.md.
