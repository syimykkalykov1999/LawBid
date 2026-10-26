import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/legal/data/legal_repository.dart';
import 'package:lawbid/features/legal/domain/legal_documents.dart';
import 'package:lawbid/features/legal/domain/legal_models.dart';

/// Owner 2026-10-05 (legal).
final legalRepositoryProvider = Provider<LegalRepository>(
  (ref) => LegalRepository(ref.watch(dioProvider)),
);

/// The owner's legal texts and the DMCA agent (`GET /legal/settings`),
/// kept for the session. Never fails: when the request errors the
/// compiled-in fallback texts are used (`legal.fallback.*`). Re-read when
/// the UI language changes (the server answers in that language).
final legalSettingsProvider = FutureProvider<LegalSettings>((ref) async {
  final t = ref.watch(translatorProvider);
  try {
    return await ref.watch(legalRepositoryProvider).settings();
  } on Object {
    return LegalSettings.fallback(t);
  }
});

/// The texts to show right now: the server's when loaded, the fallback
/// while loading. Screens read this instead of handling the async state.
final legalTextsProvider = Provider<LegalTexts>((ref) {
  final t = ref.watch(translatorProvider);
  final loaded = ref.watch(legalSettingsProvider).value;
  if (loaded == null) return LegalTexts.fallback(t);
  // Owner 2026-10-15: the owner edits these texts in English and Russian
  // only; in every other language the server sends the English one. While
  // that is still the unedited default, show the app's own translation
  // (`legal.fallback.*`, 85 languages) instead of English.
  final lang = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
  if (lang == AppLanguage.en || lang == AppLanguage.ru) return loaded.texts;
  const en = StaticTranslatorEn();
  String pick(String served, String key) =>
      served == en.t(key) ? t.t(key) : served;
  final x = loaded.texts;
  return LegalTexts(
    caseCreate: pick(x.caseCreate, 'legal.fallback.caseCreate'),
    attorneyUnverified:
        pick(x.attorneyUnverified, 'legal.fallback.attorneyUnverified'),
    supportNote: pick(x.supportNote, 'legal.fallback.supportNote'),
    partnerDisclosure:
        pick(x.partnerDisclosure, 'legal.fallback.partnerDisclosure'),
    partnerTerms: x.partnerTerms,
  );
});

/// Owner 2026-10-05 (legal documents): the language the document texts are
/// requested in — the UI language when it is Russian, else English (the
/// two languages the owner edits).
final legalDocLocaleProvider = Provider<String>((ref) {
  final lang = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
  return lang.name == 'ru' ? 'ru' : 'en';
});

/// Every current legal document (`GET /legal/documents`), for the About
/// list. Empty on failure — the screen keeps its fixed links then.
final legalDocumentListProvider = FutureProvider<List<LegalDocumentBrief>>((
  ref,
) async {
  final locale = ref.watch(legalDocLocaleProvider);
  try {
    final all = await ref.watch(legalRepositoryProvider).documents();
    final byType = <String, LegalDocumentBrief>{};
    for (final d in all) {
      final have = byType[d.docType];
      // One row per type, in the user's language when there is a text.
      if (have == null || (d.locale == locale && have.locale != locale)) {
        byType[d.docType] = d;
      }
    }
    return byType.values.toList()
      ..sort((a, b) => legalDocRank(a.docType) - legalDocRank(b.docType));
  } on Object {
    return const [];
  }
});

/// The current text of one document in the UI language (English fallback is
/// done by the server).
final legalDocumentTextProvider =
    FutureProvider.family<LegalDocumentText, String>((ref, docType) {
  final locale = ref.watch(legalDocLocaleProvider);
  return ref
      .watch(legalRepositoryProvider)
      .documentText(docType, locale: locale);
});
