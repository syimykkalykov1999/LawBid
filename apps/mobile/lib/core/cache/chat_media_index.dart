import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_database.dart';

/// What one chat's pictures take on the phone.
@immutable
class ChatMediaUsage {
  const ChatMediaUsage({
    required this.conversationId,
    required this.bytes,
    required this.files,
  });

  /// Null for pictures that belong to no known chat (link previews, chats
  /// whose history was trimmed).
  final String? conversationId;
  final int bytes;
  final int files;
}

/// Owner 2026-11-02 («Данные и память» по чатам, как у Telegram): which
/// chat the cached chat pictures came from. Telegram groups its cache by
/// chat; here the picture cache is keyed by file address, so the index
/// remembers chat → address when a message is stored, and the sizes are read
/// from the cache's own files when the screen is measured.
///
/// The cache itself is behind two functions (`sizeOf`, `remove`) so the
/// index is tested without a disk.
class ChatMediaIndex {
  ChatMediaIndex(this._db, {required this.sizeOf, required this.remove});

  final CacheDatabase _db;

  /// Bytes of the cached file under `key`, null when it is not cached.
  final Future<int?> Function(String key) sizeOf;

  /// Deletes the cached file under `key`.
  final Future<void> Function(String key) remove;

  /// A message stored in [conversationId] carries these cache keys.
  Future<void> note(String conversationId, Iterable<String> keys) async {
    if (keys.isEmpty) return;
    await _db.noteChatMedia(conversationId, keys.toSet(), DateTime.now());
  }

  /// Per chat, biggest first. Entries whose file is gone from the cache are
  /// dropped from the index here, so it never outgrows the cache.
  Future<List<ChatMediaUsage>> usage() async {
    final rows = await _db.chatMediaRows();
    final bytes = <String, int>{};
    final files = <String, int>{};
    final gone = <String>[];
    for (final r in rows) {
      final size = await sizeOf(r.url);
      if (size == null) {
        gone.add(r.url);
        continue;
      }
      bytes.update(r.conversationId, (v) => v + size, ifAbsent: () => size);
      files.update(r.conversationId, (v) => v + 1, ifAbsent: () => 1);
    }
    if (gone.isNotEmpty) await _db.forgetChatMedia(gone);
    return [
      for (final id in bytes.keys)
        ChatMediaUsage(
          conversationId: id,
          bytes: bytes[id]!,
          files: files[id]!,
        ),
    ]..sort((a, b) => b.bytes.compareTo(a.bytes));
  }

  /// Empties the pictures of [conversationIds] from the cache; answers how
  /// many bytes went.
  Future<int> clear(Iterable<String> conversationIds) async {
    final ids = conversationIds.toSet();
    var freed = 0;
    final keys = <String>[];
    for (final r in await _db.chatMediaRows()) {
      if (!ids.contains(r.conversationId)) continue;
      freed += await sizeOf(r.url) ?? 0;
      await remove(r.url);
      keys.add(r.url);
    }
    await _db.forgetChatMedia(keys);
    return freed;
  }

  /// The whole picture cache was emptied.
  Future<void> forgetAll() => _db.forgetAllChatMedia();
}
