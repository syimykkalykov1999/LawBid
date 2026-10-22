import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Owner 2026-10-22 (load audit finding 2, Telegram updates): the chats list
/// applies socket events to the rows it holds instead of reloading its first
/// page on every message, read or badge. These are the pure steps; the
/// notifier (ConversationsNotifier) calls the server only after a socket gap
/// (`updatedSince`) or for a chat it does not hold yet.

/// The server stops counting a chat's unread messages here (the app shows
/// «99+»; `badges.service.ts` UNREAD_CAP).
const kChatUnreadCap = 100;

/// The server's order of the list: pinned chats first (the newest pin
/// first), then the newest activity, then the id (newest first).
int compareConversations(Conversation a, Conversation b) {
  if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
  if (a.pinned) {
    final byPin = b.pinnedAt!.compareTo(a.pinnedAt!);
    if (byPin != 0) return byPin;
  }
  final byTime = (b.lastMessageAt ?? b.updatedAt)
      .compareTo(a.lastMessageAt ?? a.updatedAt);
  return byTime != 0 ? byTime : b.id.compareTo(a.id);
}

List<Conversation> sortedConversations(Iterable<Conversation> items) =>
    [...items]..sort(compareConversations);

/// A new message ([m]) in one of [items]: its row gets the preview, the time
/// and (when someone else wrote it) one more unread, and moves up. Null when
/// the chat is not in [items] — the caller asks the server for it. The same
/// message twice, or one older than the shown preview, changes nothing.
List<Conversation>? applyNewMessage(
  List<Conversation> items,
  ChatMessage m, {
  required String? me,
}) {
  final i = items.indexWhere((c) => c.id == m.conversationId);
  if (i < 0) return null;
  final c = items[i];
  final shownAt = c.lastMessageAt;
  if (c.lastMessage?.id == m.id ||
      (shownAt != null && m.createdAt.isBefore(shownAt))) {
    return items;
  }
  // The server counts every message not sent by me (system lines too).
  final mine = me != null && m.senderId == me;
  final next = c.withActivity(
    lastMessage: m,
    lastMessageAt: m.createdAt,
    unreadCount: mine ? null : (c.unreadCount + 1).clamp(0, kChatUnreadCap),
    updatedAt: m.createdAt.isAfter(c.updatedAt) ? m.createdAt : null,
  );
  return sortedConversations([...items]..[i] = next);
}

/// An edited / revoked / reacted message: the preview follows when it is
/// the chat's last one. Null = nothing to change.
List<Conversation>? applyUpdatedMessage(
  List<Conversation> items,
  ChatMessage m,
) {
  final i = items.indexWhere(
    (c) => c.id == m.conversationId && c.lastMessage?.id == m.id,
  );
  if (i < 0) return null;
  return [...items]..[i] = items[i].withActivity(lastMessage: m);
}

/// The other side read my messages up to [readId] (two blue ticks).
List<Conversation>? applyReceipts(
  List<Conversation> items,
  String conversationId, {
  required String readId,
  required DateTime readAt,
}) {
  final i = items.indexWhere((c) => c.id == conversationId);
  if (i < 0) return null;
  return [...items]..[i] = items[i].withReceipts(
      readId: readId,
      readAt: readAt,
      // Reading it means it got there.
      deliveredId: readId,
    );
}

/// I read the chat (this or another device): its unread pill goes.
List<Conversation>? applyReadByMe(
  List<Conversation> items,
  String conversationId,
) {
  final i = items.indexWhere((c) => c.id == conversationId);
  if (i < 0 || items[i].unreadCount == 0) return null;
  return [...items]..[i] = items[i].withActivity(unreadCount: 0);
}

/// The chats the server says changed (an `updatedSince` answer) replace
/// their rows or join the list, in the server's order.
List<Conversation> mergeChanged(
  List<Conversation> items,
  List<Conversation> changed,
) {
  if (changed.isEmpty) return items;
  final byId = {for (final c in changed) c.id: c};
  return sortedConversations([
    for (final c in items) byId.remove(c.id) ?? c,
    ...byId.values,
  ]);
}

/// Where an `updatedSince` catch-up starts: the newest change this list
/// knows (server time, so the phone's clock does not matter), a little
/// earlier to be safe (the server answers `>=`, rows are merged by id).
DateTime? catchUpSince(List<Conversation> items) {
  DateTime? newest;
  for (final c in items) {
    final at = c.updatedAt;
    if (newest == null || at.isAfter(newest)) newest = at;
  }
  return newest?.subtract(const Duration(seconds: 2));
}
