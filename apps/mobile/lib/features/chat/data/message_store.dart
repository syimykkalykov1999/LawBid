import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/cache/cache_database.dart';
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
class MessageStore {
  MessageStore(this._db, this.owner, {required int Function() limitBytes})
      : _limitBytes = limitBytes;

  final CacheDatabase _db;
  final String owner;
  final int Function() _limitBytes;
  Timer? _trim;

  /// The newest [limit] messages (newest first), older than [before] when
  /// given — the next «page» from the disk.
  Future<List<api.MessageDto>> page(
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
      return [
        for (final r in rows)
          api.MessageDto.fromJson(
            Map<String, dynamic>.from(jsonDecode(r.json) as Map),
          ),
      ];
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
    Iterable<api.MessageDto> messages, {
    Object? nextCursor = keep,
    bool? complete,
  }) async {
    try {
      await _db.putMessages(
        owner,
        conversationId,
        [
          for (final m in messages)
            (id: m.id, createdAt: m.createdAt, json: jsonEncode(m.toJson())),
        ],
      );
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
