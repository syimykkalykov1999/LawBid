# 2026-11-03 — сид переводов: xlsx заменён на JSON по языкам

PR: см. описание (ветка `claude/translations-seed-text`). SHA слияния: допишется после слияния.

- `apps/api/prisma/seed/translations_seed.xlsx` (13,6 МБ) удалён; вместо него `apps/api/prisma/seed/translations/<lang>.json` (85 файлов, отсортированные ключи) и `_meta.json` (порядок языков).
- Читатели: сид (`prisma/seed.ts`), CLI `import-translations` (принимает папку; деплой-скрипт `prod-admin-ecs.sh` передаёт папку), «Сбросить к встроенному тексту» (`i18n-texts.service`), тесты `pdf-fonts.spec`, `case-strings-coverage.spec`, новый `seed-translations.util.spec`.
- Писатели/проверки: `scripts/i18n-add.mjs`, `i18n-audit.mjs`, `i18n-glyph-audit.mjs`, `gen-longest-strings.mjs` через общий `scripts/lib/translations-seed.mjs`.
- Сверка: 6368 ключей x 85 языков, 541 280 непустых ячеек, расхождений с xlsx 0.
- KNOWN_ERRORS №39, AGENTS.md Rule #4.
