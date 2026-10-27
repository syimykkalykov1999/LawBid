import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/message_groups.dart';

/// Owner 2026-10-26 (smoothness): what the message list needs to draw its
/// rows, worked out once per change of the messages or the receipts
/// instead of on every build (it used to group all messages, build two id
/// sets and search the list on each frame the list rebuilt).
///
/// "Seen" and "delivered" are index boundaries: [items] is newest first
/// and everything from the receipt's message down (older) counts, which is
/// what the old id sets held.
class ChatListLayout {
  ChatListLayout._({
    required this.items,
    required this.entries,
    required List<int> starts,
    required int seenIndex,
    required int deliveredIndex,
    required this.seenLabelEntry,
    required this.me,
    required this.lastReadId,
    required this.lastDeliveredId,
  })  : _starts = starts,
        _seenIndex = seenIndex,
        _deliveredIndex = deliveredIndex;

  factory ChatListLayout.of({
    required List<ChatMessage> items,
    required String? me,
    required String? lastReadId,
    required String? lastDeliveredId,
  }) {
    final seenIndex =
        lastReadId == null ? -1 : items.indexWhere((m) => m.id == lastReadId);
    final deliveredIndex = lastDeliveredId == null
        ? -1
        : items.indexWhere((m) => m.id == lastDeliveredId);
    // The newest own message the other side has read (§8.2 "Seen").
    String? newestOwnSeen;
    if (seenIndex >= 0) {
      for (var k = seenIndex; k < items.length; k++) {
        if (items[k].senderId == me) {
          newestOwnSeen = items[k].id;
          break;
        }
      }
    }
    // Owner 2026-10-19: photos / files sent together share one bubble.
    final entries = groupChatMessages(items);
    final starts = List<int>.filled(entries.length, 0);
    var at = 0;
    var seenLabelEntry = -1;
    for (var i = 0; i < entries.length; i++) {
      starts[i] = at;
      final messages = entries[i].messages;
      if (newestOwnSeen != null &&
          seenLabelEntry < 0 &&
          messages.any((x) => x.id == newestOwnSeen)) {
        seenLabelEntry = i;
      }
      at += messages.length;
    }
    return ChatListLayout._(
      items: items,
      entries: entries,
      starts: starts,
      seenIndex: seenIndex,
      deliveredIndex: deliveredIndex,
      seenLabelEntry: seenLabelEntry,
      me: me,
      lastReadId: lastReadId,
      lastDeliveredId: lastDeliveredId,
    );
  }

  /// The same [items] list (by identity) and receipts: nothing to redo.
  bool sameAs({
    required List<ChatMessage> items,
    required String? me,
    required String? lastReadId,
    required String? lastDeliveredId,
  }) =>
      identical(items, this.items) &&
      me == this.me &&
      lastReadId == this.lastReadId &&
      lastDeliveredId == this.lastDeliveredId;

  /// Newest first.
  final List<ChatMessage> items;

  /// Rows, newest first.
  final List<ChatListEntry> entries;
  final String? me;
  final String? lastReadId;
  final String? lastDeliveredId;

  /// Per entry: the index in [items] of its newest message.
  final List<int> _starts;
  final int _seenIndex;
  final int _deliveredIndex;

  /// The entry that carries the "Seen" label, or -1.
  final int seenLabelEntry;

  Map<String, int>? _byId;

  /// The entry holding message [id], or -1.
  int entryOf(String id) {
    final map = _byId ??= {
      for (var i = entries.length - 1; i >= 0; i--)
        for (final m in entries[i].messages) m.id: i,
    };
    return map[id] ?? -1;
  }

  /// The other side has read entry [i]'s newest message.
  bool seen(int i) => _seenIndex >= 0 && _starts[i] >= _seenIndex;

  /// Entry [i]'s newest message reached the other device.
  bool delivered(int i) =>
      _deliveredIndex >= 0 && _starts[i] >= _deliveredIndex;
}
