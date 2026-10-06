import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/legal/data/legal_repository.dart';
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
