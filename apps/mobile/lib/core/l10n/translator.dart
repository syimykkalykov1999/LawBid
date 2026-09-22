/// Minimal string-lookup abstraction so stage 1.5 widgets never hardcode
/// user-facing text (file 07 §D.1 acceptance: "нет hardcode-цветов и строк"),
/// even though the real localization layer (file 01 §15, stage 1.6: xlsx
/// import/export, drift cache, live language switch) doesn't exist yet.
///
/// TEMPORARY SHAPE, NOT THE REAL L10N API: stage 1.6 replaces
/// [StaticTranslator] with the real `L10n` layer behind this SAME interface,
/// so call sites (`ref.watch(translatorProvider).t('key')`) do not change —
/// only the provider override in main.dart does. Documented as an explicit
/// stage-ordering judgment call in docs/CHANGELOG.md stage 1.5.
abstract interface class Translator {
  String t(String key, [Map<String, String>? params]);
}
