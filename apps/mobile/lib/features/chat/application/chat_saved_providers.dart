import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';

Duration? _noRetry(int retryCount, Object error) => null;

/// Owner 2026-10-20: the ids of the messages I saved — the chat marks them
/// in its menu («Сохранить» ↔ «Убрать из сохранённого»).
class SavedChatIdsNotifier extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() =>
      ref.read(chatExtrasRepositoryProvider).savedIds();

  bool isSaved(String messageId) => state.value?.contains(messageId) ?? false;

  /// Removes [messageId] from the saved (the «Saved» list's own button —
  /// there the mark may not be loaded yet, so it never flips to «save»).
  Future<void> remove(String messageId) async {
    final before = state.value ?? <String>{};
    state = AsyncData({...before}..remove(messageId));
    try {
      await ref.read(chatExtrasRepositoryProvider).unsave(messageId);
    } on Object {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }

  /// Saves or removes [messageId]; the mark flips at once and flips back if
  /// the server refuses (the error goes on to the caller). Returns the new
  /// state: true = saved.
  Future<bool> toggle(String messageId) async {
    final before = state.value ?? <String>{};
    final saving = !before.contains(messageId);
    final repo = ref.read(chatExtrasRepositoryProvider);
    state = AsyncData(
      saving ? {...before, messageId} : ({...before}..remove(messageId)),
    );
    try {
      if (saving) {
        await repo.save(messageId);
      } else {
        await repo.unsave(messageId);
      }
    } on Object {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
    return saving;
  }
}

final savedChatIdsProvider =
    AsyncNotifierProvider<SavedChatIdsNotifier, Set<String>>(
  SavedChatIdsNotifier.new,
  retry: _noRetry,
);
