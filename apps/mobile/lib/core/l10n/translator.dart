/// Minimal string-lookup abstraction so stage 1.5 widgets never hardcode
/// user-facing text (file 07 §D.1 acceptance: "нет hardcode-цветов и строк"),
/// even though the real localization layer (file 01 §15, stage 1.6: xlsx
/// import/export, drift cache, live language switch) doesn't exist yet.
///
/// UPDATE, stage 1.6 (docs/CHANGELOG.md): `l10n_providers.dart`'s
/// `translatorProvider` now returns `L10nTranslator` (l10n_translator.dart),
/// a real backend-driven implementation of THIS SAME interface — the
/// static maps in static_translator.dart (`StaticTranslatorRu`/`En`) are
/// kept on as its compiled-in seed/fallback layer, not deleted. Every call
/// site (`ref.watch(translatorProvider).t('key')`) is unchanged; only that
/// provider's implementation is. Documented as an explicit stage-ordering
/// judgment call in docs/CHANGELOG.md stage 1.5.
abstract interface class Translator {
  String t(String key, [Map<String, String>? params]);
}
