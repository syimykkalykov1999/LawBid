import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/cache/cache_database.dart';

/// What one chat's pictures take on the phone.
@immutable
class ChatMediaUsage {
  const ChatMediaUsage({required this.conversationId, required this.bytes});

  final String conversationId;
  final int bytes;
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
  ChatMediaIndex(
    this._db, {
    required this.sizeOf,
    required this.remove,
    this.fileOf,
  });

  static const _staleAfter = Duration(days: 30);

  final CacheDatabase _db;

  /// Bytes of the cached file under `key`, null when it is not cached.
  final Future<int?> Function(String key) sizeOf;

  /// Deletes the cached file under `key`.
  final Future<void> Function(String key) remove;

  /// The cached file under `key`, null when it is not cached (without it
  /// [filePaths] is empty).
  final Future<File?> Function(String key)? fileOf;

  /// Owner 2026-11-03: where the pictures of personal chats are on disk, so
  /// the auto-delete age can tell them from the groups' files.
  Future<Set<String>> filePaths() async {
    final lookup = fileOf;
    if (lookup == null) return const {};
    final paths = <String>{};
    for (final r in await _db.chatMediaRows()) {
      final f = await lookup(r.url);
      if (f != null) paths.add(f.path);
    }
    return paths;
  }

  /// A message stored in [conversationId] carries these cache keys.
  Future<void> note(String conversationId, Iterable<String> keys) async {
    if (keys.isEmpty) return;
    await _db.noteChatMedia(conversationId, keys.toSet(), DateTime.now());
  }

  /// Per chat, biggest first. A file not in the cache yet (the message is
  /// stored before its picture is fetched) is skipped, not forgotten; only
  /// entries unseen for [_staleAfter] are dropped, so the index cannot
  /// outgrow the cache.
  Future<List<ChatMediaUsage>> usage() async {
    final rows = await _db.chatMediaRows();
    final bytes = <String, int>{};
    final gone = <String>[];
    final now = DateTime.now();
    for (final r in rows) {
      final size = await sizeOf(r.url);
      if (size == null) {
        if (now.difference(r.notedAt) > _staleAfter) gone.add(r.url);
        continue;
      }
      bytes.update(r.conversationId, (v) => v + size, ifAbsent: () => size);
    }
    if (gone.isNotEmpty) await _db.forgetChatMedia(gone);
    return [
      for (final id in bytes.keys)
        ChatMediaUsage(conversationId: id, bytes: bytes[id]!),
    ]..sort((a, b) => b.bytes.compareTo(a.bytes));
  }

  /// Empties the pictures of [conversationIds] from the cache; answers how
  /// many bytes went. The index rows stay: when the chat is opened again
  /// and the pictures are fetched, they are counted under it again.
  Future<int> clear(Iterable<String> conversationIds) async {
    final ids = conversationIds.toSet();
    var freed = 0;
    for (final r in await _db.chatMediaRows()) {
      if (!ids.contains(r.conversationId)) continue;
      freed += await sizeOf(r.url) ?? 0;
      await remove(r.url);
    }
    return freed;
  }
}
