import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/application/group_providers.dart'
    show
        groupMessageStoreProvider,
        groupThreadMemoryProvider,
        groupThreadStoreKey;
import 'package:lawbid/features/social/application/social_providers.dart';

// Group threads keep their copy on the phone the same way (groups goes
// through this layer, test/architecture/feature_boundaries_test.dart).
export 'package:lawbid/features/chat/data/message_store.dart'
    show CachedMessageStore;

/// R-404 (c) (owner 2026-11-04, iPhone recording: the message list came a
/// few frames after the chat screen): the newest page of the chats opened
/// or listed recently, in memory. A chat whose page is here draws its
/// bubbles in the SAME frame as its header and composer; the phone's copy
/// and the server's delta follow without a blank-then-repaint. Telegram's
/// MessagesController keeps the dialogs' messages in memory the same way.
///
/// Small on purpose: [capacity] chats × [pageSize] messages, least
/// recently used dropped first.
class ChatThreadMemory extends ThreadMemory<ChatMessage> {
  ChatThreadMemory({super.capacity, super.pageSize});
}

/// The memory of [ChatThreadMemory] for any kind of message (groups
/// WhatsApp parity: the group threads keep theirs the same way).
class ThreadMemory<T> {
  ThreadMemory({this.capacity = 12, this.pageSize = 50});

  final int capacity;
  final int pageSize;
  final _pages = <String, List<T>>{};

  bool contains(String conversationId) => _pages.containsKey(conversationId);

  /// The remembered page (newest first), marking it as used now.
  List<T>? take(String conversationId) {
    final page = _pages.remove(conversationId);
    if (page != null) _pages[conversationId] = page;
    return page;
  }

  /// Remembers the newest [pageSize] of [messages] (newest first).
  void put(String conversationId, List<T> messages) {
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

  /// Owner 26.11 (groups like 1:1): the newest groups of the list (those
  /// without topics open straight on their thread) are warmed the same way.
  List<String> _wantedGroups = const [];

  void _onList(List<ChatListEntry> entries) {
    final newest = entries.take(kChatPrewarmCount).toList();
    _wanted = <String>[
      for (final e in newest)
        if (e case DirectChatEntry(:final conversation))
          conversation.id
        else if (e case PersonChatEntry(:final row))
          row.id,
    ];
    _wantedGroups = <String>[
      for (final e in newest)
        if (e case GroupChatEntry(:final group) when !group.topicsEnabled)
          group.id,
    ];
    _running ??= _warm().whenComplete(() => _running = null);
  }

  Future<void> _warm() async {
    final store = _ref.read(messageStoreProvider);
    final memory = _ref.read(chatThreadMemoryProvider);
    while (store != null && !_cancelled) {
      final id = _wanted
          .where((id) => !memory.contains(id) && !_done.contains(id))
          .firstOrNull;
      if (id == null) break;
      _done.add(id);
      final page = await store.page(id, limit: memory.pageSize);
      if (_cancelled) return;
      if (page.isNotEmpty && !memory.contains(id)) {
        memory.put(id, page.map(ChatMappers.message).toList());
      }
    }
    await _warmGroups();
  }

  /// The groups' newest page from the phone's copy into their memory
  /// (GroupThread draws it in its first frame, as a 1:1 chat does).
  Future<void> _warmGroups() async {
    final store = _ref.read(groupMessageStoreProvider);
    final memory = _ref.read(groupThreadMemoryProvider);
    if (store == null) return;
    while (!_cancelled) {
      final key = _wantedGroups
          .map((id) => groupThreadStoreKey((groupId: id, topicId: null)))
          .where((k) => !memory.contains(k) && !_done.contains(k))
          .firstOrNull;
      if (key == null) return;
      _done.add(key);
      final page = await store.page(key, limit: memory.pageSize);
      if (_cancelled) return;
      if (page.isNotEmpty && !memory.contains(key)) memory.put(key, page);
    }
  }
}

/// Watched by the chats list while it is on screen.
final chatPrewarmProvider = Provider.autoDispose<ChatPrewarmer>(
  ChatPrewarmer.new,
);
