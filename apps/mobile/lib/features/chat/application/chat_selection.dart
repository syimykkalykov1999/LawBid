import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-02 — "Select chats" in the chats list (Instagram-style):
/// null = off, otherwise the ids picked so far.
class ChatSelection extends Notifier<Set<String>?> {
  @override
  Set<String>? build() => null;

  void start() => state = <String>{};

  void stop() => state = null;

  void toggle(String id) {
    final current = state;
    if (current == null) return;
    state =
        current.contains(id) ? ({...current}..remove(id)) : {...current, id};
  }

  void setAll(Iterable<String> ids) => state = ids.toSet();

  void clear() {
    if (state != null) state = <String>{};
  }
}

final chatSelectionProvider =
    NotifierProvider.autoDispose<ChatSelection, Set<String>?>(
  ChatSelection.new,
);
