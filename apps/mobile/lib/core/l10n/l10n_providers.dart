import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_language.dart';
import 'language_providers.dart';
import 'static_translator.dart';
import 'translator.dart';

/// Watches [languageControllerProvider] and returns the matching
/// [Translator] (owner request, 2026-09-22 — see static_translator.dart doc
/// comment). Stage 1.6 overrides this with the real L10n-backed [Translator];
/// every call site keeps working unchanged (see translator.dart doc comment).
final translatorProvider = Provider<Translator>((ref) {
  final language = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
  return switch (language) {
    AppLanguage.ru => const StaticTranslatorRu(),
    AppLanguage.en => const StaticTranslatorEn(),
  };
});
