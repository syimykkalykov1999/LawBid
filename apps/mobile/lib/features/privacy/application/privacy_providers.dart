import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/privacy/data/privacy_repository.dart';

final privacyRepositoryProvider = Provider<PrivacyRepository>(
  (ref) => ApiPrivacyRepository(ref.watch(dioProvider)),
);

/// Settings → Privacy: who sees my last seen, may write first, may call.
class PrivacySettingsNotifier extends AsyncNotifier<PrivacySettings> {
  @override
  Future<PrivacySettings> build() =>
      ref.watch(privacyRepositoryProvider).settings();

  /// Shows the new value at once; goes back to the old one when the server
  /// refuses. Throws an `ApiException`.
  Future<void> change(PrivacyField field, Audience value) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(
      switch (field) {
        PrivacyField.lastSeen => before.copyWith(lastSeen: value),
        PrivacyField.messageFrom => before.copyWith(messageFrom: value),
        PrivacyField.callFrom => before.copyWith(callFrom: value),
        PrivacyField.photoFrom => before.copyWith(photoFrom: value),
        PrivacyField.aboutFrom => before.copyWith(aboutFrom: value),
        PrivacyField.groupAddFrom => before.copyWith(groupAddFrom: value),
      },
    );
    try {
      state = AsyncData(
        await ref.read(privacyRepositoryProvider).change(field, value),
      );
      // The chat list's online dots follow "last seen".
      if (field == PrivacyField.lastSeen) ref.invalidate(conversationsProvider);
    } on Object {
      state = AsyncData(before);
      rethrow;
    }
  }

  /// Owner 2026-10-22 (CCPA): the «Do not sell or share» switch, shown at
  /// once and rolled back when the server refuses.
  Future<void> setDoNotSell({required bool value}) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(before.copyWith(doNotSell: value));
    try {
      state = AsyncData(
        await ref.read(privacyRepositoryProvider).setDoNotSell(value: value),
      );
    } on Object {
      state = AsyncData(before);
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
