import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// R-404 (c) (owner 2026-11-04, iPhone recording: the message list came a
/// few frames after the chat screen): the newest page of the chats opened
/// or listed recently, in memory. A chat whose page is here draws its
/// bubbles in the SAME frame as its header and composer; the phone's copy
/// and the server's delta follow without a blank-then-repaint. Telegram's
/// MessagesController keeps the dialogs' messages in memory the same way.
///
/// Small on purpose: [capacity] chats × [pageSize] messages, least
/// recently used dropped first.
class ChatThreadMemory {
  ChatThreadMemory({this.capacity = 12, this.pageSize = 50});

  final int capacity;
  final int pageSize;
  final _pages = <String, List<ChatMessage>>{};

  bool contains(String conversationId) => _pages.containsKey(conversationId);

  /// The remembered page (newest first), marking it as used now.
  List<ChatMessage>? take(String conversationId) {
    final page = _pages.remove(conversationId);
    if (page != null) _pages[conversationId] = page;
    return page;
  }

  /// Remembers the newest [pageSize] of [messages] (newest first).
  void put(String conversationId, List<ChatMessage> messages) {
    if (messages.isEmpty) return;
    _pages.remove(conversationId);
    _pages[conversationId] = messages.length > pageSize
        ? List.unmodifiable(messages.sublist(0, pageSize))
        : messages;
    while (_pages.length > capacity) {
      _pages.remove(_pages.keys.first);
    }
  }

  void clear() => _pages.clear();
}

/// One memory per signed-in account (a sign-out drops it).
final chatThreadMemoryProvider = Provider<ChatThreadMemory>((ref) {
  ref.watch(currentUserIdProvider);
  return ChatThreadMemory();
});

/// How many of the newest chats of the list are pre-warmed.
const kChatPrewarmCount = 5;

/// R-404 (c): while the Chats tab is on screen, the first page of the
/// newest [kChatPrewarmCount] chats is read from the phone's copy into
/// [ChatThreadMemory], so a tap opens on the messages at once (Telegram
/// preloads the dialogs' history the same way). Only the phone is read —
/// no request; a chat already in memory, or read once, is not read again.
class ChatPrewarmer {
  ChatPrewarmer(this._ref) {
    _ref
      ..listen(
        mergedChatListProvider,
        (_, list) => _onList(list.value?.items ?? const []),
        fireImmediately: true,
      )
      ..onDispose(() => _cancelled = true);
  }

  final Ref _ref;
  final _done = <String>{};
  bool _cancelled = false;
  Future<void>? _running;

  /// The newest list's chats to warm (a list that moves while a run is in
  /// flight is picked up by that run).
  List<String> _wanted = const [];

  void _onList(List<ChatListEntry> entries) {
    _wanted = <String>[
      for (final e in entries.take(kChatPrewarmCount))
        if (e case DirectChatEntry(:final conversation))
          conversation.id
        else if (e case PersonChatEntry(:final row))
          row.id,
    ];
    _running ??= _warm().whenComplete(() => _running = null);
  }

  Future<void> _warm() async {
    final store = _ref.read(messageStoreProvider);
    final memory = _ref.read(chatThreadMemoryProvider);
    if (store == null) return;
    while (!_cancelled) {
      final id = _wanted
          .where((id) => !memory.contains(id) && !_done.contains(id))
          .firstOrNull;
      if (id == null) return;
      _done.add(id);
      final page = await store.page(id, limit: memory.pageSize);
      if (_cancelled) return;
      if (page.isNotEmpty && !memory.contains(id)) {
        memory.put(id, page.map(ChatMappers.message).toList());
      }
    }
  }
}

/// Watched by the chats list while it is on screen.
final chatPrewarmProvider = Provider.autoDispose<ChatPrewarmer>(
  ChatPrewarmer.new,
);
