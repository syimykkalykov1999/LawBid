import 'package:flutter/foundation.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Owner 2026-10-19 (Telegram / WhatsApp albums): at most this many
/// attachments share one bubble.
const int kChatAlbumMax = 10;

/// Attachments sent further apart than this start a new bubble.
const Duration kChatAlbumGap = Duration(minutes: 1);

/// One row of the message list: a single message, or an album — photos and
/// videos (or documents) sent together, shown as one bubble.
@immutable
class ChatListEntry {
  const ChatListEntry(this.messages);

  /// Oldest first; never empty.
  final List<ChatMessage> messages;

  bool get isGroup => messages.length > 1;

  /// The bubble's time, ticks and caption come from here.
  ChatMessage get newest => messages.last;
  ChatMessage get oldest => messages.first;
}

/// A photo or a video (the album grid) — documents group separately.
bool isChatMedia(ChatAttachment a) => a.isImage || a.isVideo;

/// Owner 2026-10-19: the server has no album id, so the app groups
/// [newestFirst] (the thread's order) itself. Consecutive messages join one
/// entry when they are attachments of the same kind (media vs documents)
/// from the same sender, on the same day, each within [kChatAlbumGap] of
/// the previous, at most [kChatAlbumMax] per entry, and only the newest
/// one carries a caption (a caption closes the album). Returns the entries
/// newest first.
List<ChatListEntry> groupChatMessages(List<ChatMessage> newestFirst) {
  final groups = <List<ChatMessage>>[];
  for (final m in newestFirst.reversed) {
    final current = groups.isEmpty ? null : groups.last;
    if (current != null && _joins(current, m)) {
      current.add(m);
    } else {
      groups.add([m]);
    }
  }
  return [
    for (final g in groups.reversed) ChatListEntry(List.unmodifiable(g)),
  ];
}

bool _joins(List<ChatMessage> group, ChatMessage m) {
  final prev = group.last;
  final a = m.attachment;
  final pa = prev.attachment;
  if (m.kind != MessageKind.attachment ||
      prev.kind != MessageKind.attachment ||
      a == null ||
      pa == null) {
    return false;
  }
  if (group.length >= kChatAlbumMax) return false;
  if (prev.body.trim().isNotEmpty) return false;
  if (m.senderId != prev.senderId ||
      m.sentByAssistant != prev.sentByAssistant) {
    return false;
  }
  if (isChatMedia(a) != isChatMedia(pa)) return false;
  final t = m.createdAt.toLocal();
  final pt = prev.createdAt.toLocal();
  if (t.difference(pt).abs() > kChatAlbumGap) return false;
  return t.year == pt.year && t.month == pt.month && t.day == pt.day;
}
