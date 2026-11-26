import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/json_off_main.dart';
import 'package:lawbid/core/media/stable_network_image.dart'
    show stableImageCacheKey;
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart' show E2eeService;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// What the phone knows about one chat's history.
class ConversationHistory {
  const ConversationHistory({
    this.newestId,
    this.nextCursor,
    this.complete = false,
  });

  /// The newest message on the phone — the `afterId` of the catch-up.
  final String? newestId;

  /// The server's cursor for the page after the oldest one on the phone.
  final String? nextCursor;

  /// The start of the chat was reached.
  final bool complete;
}

/// Owner 2026-10-22 (client economy plan, package C, WhatsApp): chat
/// messages on the phone — the chat opens from here without a request,
/// the server is asked only for what came after the newest one
/// (`afterId`), and older pages go to disk as they are read. Bounded by
/// the `messages` store limit, least recently opened chat out first (plan
/// §5.1). Rows are the server's `MessageDto` JSON as received.
///
/// Item 25: an end-to-end encrypted message is stored as it came (`mls`
/// with its ciphertext, [E2eeService.storable]) — never the opened text,
/// never an empty text for one that did not open yet; [prime] puts the
/// decrypted texts back (from E2eePlaintexts) when a page is read, and
/// starts a new try for the ones that never opened.
class MessageStore extends CachedMessageStore<api.MessageDto> {
  MessageStore(
    super.db,
    super.owner, {
    required super.limitBytes,
    this.prime,
  }) : super(
          decode: _messageOf,
          encode: E2eeService.storable,
          idOf: (m) => m.id,
          createdAtOf: (m) => m.createdAt,
          imageUrlsOf: (m) => [
            if (m.attachment?.isImage ?? false) ...[
              m.attachment!.url,
              m.attachment!.previewUrl,
            ],
          ],
        );

  /// Item 25: readies the end-to-end encrypted messages of a page read
  /// from the disk ([E2eeService.prime]).
  final Future<void> Function(List<api.MessageDto> rows)? prime;

  @override
  Future<List<api.MessageDto>> page(
    String conversationId, {
    int limit = 50,
    DateTime? before,
  }) async {
    final rows = await super.page(conversationId, limit: limit, before: before);
    final p = prime;
    if (p != null && rows.any((m) => m.type == api.MessageDtoType.mls)) {
      try {
        await p(rows);
      } on Object catch (e) {
        debugPrint('e2ee prime: $e');
      }
    }
    return rows;
  }

  /// A realtime payload (`message:new` / `message:updated`, same shape as
  /// `MessageDto`).
  Future<void> putRaw(String conversationId, Object? raw) {
    if (raw is! Map) return Future.value();
    try {
      final m = api.MessageDto.fromJson(Map<String, dynamic>.from(raw));
      return put(conversationId, [m]);
    } on Object {
      return Future.value();
    }
  }

  static api.MessageDto _messageOf(Object? json) =>
      api.MessageDto.fromJson(Map<String, dynamic>.from(json! as Map));

  /// «Leave the cursor as it is» marker for [put].
  static const Object keep = CachedMessageStore.keep;
}

/// The phone's copy of one kind of chat message (the 1:1 [MessageStore];
/// groups WhatsApp parity: the group thread's copy, `GroupMessageStore`):
/// the same table, the same LRU limit and trimming, rows are the server's
/// DTO JSON as received.
class CachedMessageStore<T> {
  CachedMessageStore(
    CacheDatabase db,
    this.owner, {
    required int Function() limitBytes,
    required T Function(Object? json) decode,
    required Map<String, dynamic> Function(T m) encode,
    required String Function(T m) idOf,
    required DateTime Function(T m) createdAtOf,
    List<String?> Function(T m)? imageUrlsOf,
  })  : _db = db,
        _limitBytes = limitBytes,
        _decode = decode,
        _encode = encode,
        _idOf = idOf,
        _createdAtOf = createdAtOf,
        _imageUrlsOf = imageUrlsOf;

  final CacheDatabase _db;
  final String owner;
  final int Function() _limitBytes;
  final T Function(Object? json) _decode;
  final Map<String, dynamic> Function(T m) _encode;
  final String Function(T m) _idOf;
  final DateTime Function(T m) _createdAtOf;
  final List<String?> Function(T m)? _imageUrlsOf;
  Timer? _trim;

  /// The newest [limit] messages (newest first), older than [before] when
  /// given — the next «page» from the disk.
  Future<List<T>> page(
    String conversationId, {
    int limit = 50,
    DateTime? before,
  }) async {
    try {
      final rows = await _db.messagesOf(
        owner,
        conversationId,
        limit: limit,
        before: before,
      );
      // Owner 2026-10-26 (smoothness): a big page is decoded off the UI
      // thread (web: in slices), so opening a chat does not stutter.
      return await decodeJsonRows(
        [for (final r in rows) r.json],
        _decode,
      );
    } on Object catch (e) {
      debugPrint('messages read: $e');
      return const [];
    }
  }

  Future<ConversationHistory?> history(String conversationId) async {
    try {
      final row = await _db.conversationSyncOf(owner, conversationId);
      if (row == null) return null;
      return ConversationHistory(
        newestId: row.newestId,
        nextCursor: row.nextCursor,
        complete: row.complete,
      );
    } on Object {
      return null;
    }
  }

  /// Messages from a page, a catch-up, a write or an event.
  Future<void> put(
    String conversationId,
    Iterable<T> messages, {
    Object? nextCursor = keep,
    bool? complete,
  }) async {
    try {
      await _db.putMessages(
        owner,
        conversationId,
        [
          for (final m in messages)
            (
              id: _idOf(m),
              createdAt: _createdAtOf(m),
              json: jsonEncode(_encode(m)),
            ),
        ],
      );
      // «Данные и память» по чатам: which chat these pictures belong to. An
      // auxiliary index: its failure must not stop the history bookkeeping.
      try {
        final imagesOf = _imageUrlsOf;
        await _db.noteChatMedia(
          conversationId,
          {
            if (imagesOf != null)
              for (final m in messages)
                for (final u in imagesOf(m))
                  if (u != null) stableImageCacheKey(u) ?? u,
          },
          DateTime.now(),
        );
      } on Object catch (e) {
        debugPrint('chat media index: $e');
      }
      final newest = await _db.newestMessage(owner, conversationId);
      await _db.setConversationSync(
        owner: owner,
        conversationId: conversationId,
        now: DateTime.now(),
        newestId: newest?.id,
        nextCursor:
            identical(nextCursor, keep) ? CacheDatabase.keep : nextCursor,
        complete: complete,
      );
      _scheduleTrim(conversationId);
    } on Object catch (e) {
      debugPrint('messages write: $e');
    }
  }

  Future<void> remove(String conversationId, String id) =>
      _db.deleteMessage(owner, conversationId, id).catchError((Object _) {});

  /// The copy is no good any more (`409 SYNC_TOO_OLD`): the chat starts
  /// over from a server page.
  Future<void> forget(String conversationId) =>
      _db.dropConversation(owner, conversationId).catchError((Object _) {});

  /// The chat was opened: it is the most recently used (LRU).
  Future<void> touch(String conversationId) => _db
      .setConversationSync(
        owner: owner,
        conversationId: conversationId,
        now: DateTime.now(),
      )
      .catchError((Object _) {});

  /// Stops a pending trim (the owner of this store is gone).
  void dispose() => _trim?.cancel();

  void _scheduleTrim(String keepConversation) {
    _trim?.cancel();
    _trim = Timer(const Duration(seconds: 2), () {
      _db
          .trimMessages(_limitBytes(), keep: keepConversation)
          .catchError((Object e) {
        debugPrint('messages trim: $e');
        return const <String>[];
      });
    });
  }

  /// «Leave the cursor as it is» marker for [put].
  static const Object keep = Object();
}
