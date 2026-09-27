### p12 leaf-1.5 — mobile i18n (docs/01 §8.1, §9; docs/07 §8)

- **Server-driven languages** (§9.3/§9.4, stage 1.6 acceptance "новый язык,
  импортированный через xlsx, появляется в приложении без пересборки"):
  `AppLanguage` is now a value class keyed by ISO 639-1 code (same
  `en`/`ru`/`values`/`name` API as the old enum). `GET /i18n/languages` is
  fetched on the splash and cached locally; every active server language
  is selectable in the existing language picker (UI unchanged; rows the
  server doesn't serve keep the "coming soon" badge). A server-only
  language renders from its `GET /i18n/bundle/:lang` bundle (Drift cache,
  `since=` delta) with English fallback per key (§9.3).
- **System locale** (§9.4): with no explicit choice the app uses the first
  system locale whose language is active (compiled-in en/ru offline, the
  cached server list afterwards), otherwise English. Auto-detection is not
  persisted; picking a language is.
- **Plurals** (§9.2): `Translator.plural(key, count)` resolves
  `key.one/.few/.many/.other` via intl's CLDR rules; `{count}` is
  locale-formatted.
- **Dates/numbers/currency** (§9.4): `l10nFormatsProvider` (`intl`, per
  selected language; unknown locales format as English).
- **Theme + language on the server** (docs/07 §8.1, docs/01 §15 stage 1.7
  item 7): `PreferencesSyncController` (core/theme) PATCHes
  `/users/me {theme|uiLanguage}` through `OnboardingRepository` when signed
  in; after login a returning account's values are applied locally, a new
  account's welcome-screen choices are pushed; offline changes stay
  pending and are retried.
- **EN texts = docs/07 §8** (owner decision): `auth.welcome.title`,
  `auth.welcome.legal`, `auth.phone.subtitle`, `auth.phone.terms`,
  `auth.otp.submit`, `onboarding.role.attorney.desc` updated; RU unchanged.
  xlsx updates listed in `apps/api/prisma/seed/pending_keys/leaf-1.5.csv`
  (`op=update`). Goldens regenerated for the text change only: auth
  welcome/phone/otp/role and onboarding email (light + dark).
- Not done: RTL layout for `is_rtl` languages (not required by §9.4; no
  RTL language is active).
