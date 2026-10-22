# Legal documents in ten languages

Owner 2026-10-22, audit #4 §4. Every user must accept Terms, Privacy and the Disclaimer, and the app speaks 85 languages; the legal texts now exist for the ten most used ones: **en, ru, es, fr, de, it, pt, nl, pl, uk** (`LEGAL_LOCALES`, `apps/api/src/modules/legal-documents/legal-documents.constants.ts`). Anyone else reads English. A person's app language picks the document (`pt-BR` → `pt`).

## How the texts are made

The repo keeps legal texts as committed Markdown files in `apps/api/assets/legal/<type>.<lang>.md`; on boot `LegalDocumentsSeed` puts a missing language in as a **draft** (never published by itself). `en` and `ru` are hand-written. The other eight are machine translations of the English file made with the same provider the app uses for translations (Google Cloud Translation):

```sh
npm run legal:check                                         # what is missing (no key needed)
GOOGLE_TRANSLATE_API_KEY=… npm run legal:translate           # write the missing files
GOOGLE_TRANSLATE_API_KEY=… npm run legal:translate -- --force --docs terms   # redo after an English change
```

The script translates line by line, keeps headings, lists, links, e-mails and `{placeholders}` intact, and starts each file with a translated sentence saying the English original governs. Cost: ~73 000 English characters × 8 languages ≈ 0.6 M characters ≈ **$12** once.

## Owner steps

1. Run `npm run legal:translate` with the Google Translate key (Админка → Интеграции → Google Translate) and commit the 80+ files (`disclaimer.ru.md` is made too — it was missing).
2. Deploy; the drafts appear in Админка → Документы, one column per language.
3. Have the translations read (ideally a licensed attorney or a sworn translator for at least es / fr / de), then publish each language. Until a language is published, its users see the English text.
