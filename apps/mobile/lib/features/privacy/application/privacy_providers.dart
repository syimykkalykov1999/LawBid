import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';

final privacyRepositoryProvider = Provider<PrivacyRepository>(
  (ref) => ApiPrivacyRepository(ref.watch(dioProvider)),
);

/// Settings → Privacy: who sees my last seen, may write first, may call
/// (owner 2026-10-28: also my followers / people I follow).
class PrivacySettingsNotifier extends AsyncNotifier<PrivacySettings> {
  @override
  Future<PrivacySettings> build() =>
      ref.watch(privacyRepositoryProvider).settings();

  /// Shows the new value at once; when the server refuses, shows what the
  /// server has (verify batch 7, PS4: going back to the snapshot taken
  /// before this tap could drop another change that succeeded meanwhile).
  /// Throws an `ApiException`.
  Future<void> change(PrivacyField field, Audience value) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(before.withField(field, {value}));
    try {
      state = AsyncData(
        await ref
            .read(privacyRepositoryProvider)
            .change(field, value, followAudiences: before.followAudiences),
      );
      // The chat list's online dots follow "last seen".
      if (field == PrivacyField.lastSeen) ref.invalidate(conversationsProvider);
    } on Object {
      await _reloadAfterError(
        (now) => now.withField(field, before.of(field)),
      );
      rethrow;
    }
  }

  /// PS4: the server's settings after a refused change. When even that read
  /// fails (offline), only the tapped row goes back to its old value
  /// ([undo]): the rows stay on screen (final pass 18.11, FA1: reloading
  /// the provider here put a full-screen error in place of the settings).
  Future<void> _reloadAfterError(
    PrivacySettings Function(PrivacySettings now) undo,
  ) async {
    try {
      final fresh = await ref.read(privacyRepositoryProvider).settings();
      if (ref.mounted) state = AsyncData(fresh);
    } on Object {
      final now = state.value;
      if (ref.mounted && now != null) state = AsyncData(undo(now));
    }
  }

  /// Owner 2026-10-22 (CCPA): the «Do not sell or share» switch, shown at
  /// once; when the server refuses, the server's settings are shown.
  Future<void> setDoNotSell({required bool value}) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(before.copyWith(doNotSell: value));
    try {
      state = AsyncData(
        await ref.read(privacyRepositoryProvider).setDoNotSell(value: value),
      );
    } on Object {
      await _reloadAfterError(
        (now) => now.copyWith(doNotSell: before.doNotSell),
      );
      rethrow;
    }
  }
}

final privacySettingsProvider =
    AsyncNotifierProvider.autoDispose<PrivacySettingsNotifier, PrivacySettings>(
  PrivacySettingsNotifier.new,
);

/// Decisions of moderation on my posts, comments and messages.
final moderationNoticesProvider =
    FutureProvider.autoDispose<List<ModerationNotice>>(
  (ref) => ref.watch(privacyRepositoryProvider).notices(),
  retry: (_, __) => null,
);

/// My reports with their status.
final myReportsProvider = FutureProvider.autoDispose<List<MyReport>>(
  (ref) => ref.watch(privacyRepositoryProvider).myReports(),
  retry: (_, __) => null,
);
