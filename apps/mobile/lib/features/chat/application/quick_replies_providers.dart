import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/data/quick_replies_repository.dart';

/// Owner 2026-11-02: my quick replies. Read once per session (a handful of
/// short rows), changed in place; the list is the server's order.
class QuickRepliesNotifier extends AsyncNotifier<List<QuickReply>> {
  @override
  Future<List<QuickReply>> build() =>
      ref.read(quickRepliesRepositoryProvider).list();

  QuickRepliesRepository get _repo => ref.read(quickRepliesRepositoryProvider);

  /// Adds a reply; the error (limit, network) goes on to the caller.
  Future<void> add(String title, String body) async {
    final made = await _repo.create(title, body);
    state = AsyncData([...?state.value, made]);
  }

  Future<void> edit(String id, String title, String body) async {
    final made = await _repo.update(id, title, body);
    state = AsyncData([
      for (final r in state.value ?? const <QuickReply>[])
        if (r.id == id) made else r,
    ]);
  }

  /// Removes at once and puts the row back if the server refuses.
  Future<void> remove(String id) async {
    final before = state.value ?? const <QuickReply>[];
    state = AsyncData([
      for (final r in before)
        if (r.id != id) r,
    ]);
    try {
      await _repo.delete(id);
    } on Object {
      if (ref.mounted) state = AsyncData(before);
      rethrow;
    }
  }
}

final quickRepliesProvider =
    AsyncNotifierProvider<QuickRepliesNotifier, List<QuickReply>>(
  QuickRepliesNotifier.new,
);
