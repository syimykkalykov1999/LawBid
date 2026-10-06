import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
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
  final loaded = ref.watch(legalSettingsProvider).value;
  return loaded?.texts ?? LegalTexts.fallback(ref.watch(translatorProvider));
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
