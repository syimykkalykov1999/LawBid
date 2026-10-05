## Owner 2026-10-05 — per-state bar registries

- `state_bar_registries`: per state adapter (manual, NY open data, Socrata,
  any JSON REST API), settings and an encrypted API key; enabling a state
  needs no release. Flag `auto_bar_check` retired (NY row inherits it).
- Self-attested licenses are looked up after approval in enabled states; a
  difference sets `attorney_licenses.registry_flag` (never rejects).
- Admin: Ключи и сервисы → "Реестры адвокатов по штатам" (save with 2FA,
  test lookup, copy to states); Верификация → "Сверка с реестром"
  (re-check, clear mark); "По реестру" button on the request card.
- Monthly `licenses.registry-recheck` covers every enabled state.
- Docs: `docs/STATE_BAR_REGISTRIES.md`.
