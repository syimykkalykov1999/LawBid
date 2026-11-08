import 'dart:async';

import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/data/message_store.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Owner 2026-11-08 («кэш есть, а не работает»; Telegram / WhatsApp: a chat
/// opened again while the app stayed online asks the server nothing).
///
/// Before, every open of a chat sent three GETs (the conversation, the
/// messages after the newest one on the phone, the pinned messages), even
/// a second after it was closed. Telegram's model (core.telegram.org/api/
/// updates, «Recovering gaps»): the client is exact as long as its update
/// stream has no gap; it asks the server (`getDifference`) only after one.
///
/// Here: a chat closed while the socket was up and in step is remembered
/// with the socket's [RealtimeClient.connectionEpoch] and its pinned
/// messages. Until the socket drops (a new epoch), the chat's own events
/// keep that copy exact: a new or changed message is written to the
/// phone's [MessageStore] and to the pinned list here. Anything this copy
/// cannot follow (`conversation:update`, a voice listened, a reconnect)
/// forgets the chat, and its next open asks the server as before.
class ChatSyncLedger {
  ChatSyncLedger(
    this._store, {
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final MessageStore? Function() _store;
  final DateTime Function() _now;

  /// A safety net: a copy older than this is asked about again anyway.
  static const maxAge = Duration(minutes: 30);

  final _synced = <String, _Synced>{};
  final _open = <String>{};
  final _writes = <String, Future<void>>{};

  /// The chat's screen is open: it follows its own events.
  void opened(String id) => _open.add(id);

  /// The chat's screen closed. [epoch] is the connection it was last in
  /// step with (null: not in step, nothing is kept); [pins] its pinned
  /// messages and rules as shown.
  void closed(String id, {required int? epoch, required ChatPins? pins}) {
    _open.remove(id);
    if (epoch == null || pins == null) {
      _synced.remove(id);
      return;
    }
    _synced[id] = _Synced(epoch, pins, _now());
  }

  /// The pinned messages of [id] when the phone's copy of the chat is still
  /// exact in connection [epoch]; null when the server must be asked.
  ChatPins? inStep(String id, int epoch) {
    final s = _synced[id];
    if (s == null) return null;
    if (s.epoch != epoch || _now().difference(s.at) > maxAge) {
      _synced.remove(id);
      return null;
    }
    return s.pins;
  }

  /// Waits for the event writes of [id] still going to the phone.
  Future<void> settled(String id) => _writes[id] ?? Future<void>.value();

  void forget(String id) => _synced.remove(id);

  void onEvent(RealtimeEvent e) {
    final data = e.data;
    switch (e.name) {
      case RealtimeEvent.reconnected:
        _synced.clear();
      case 'message:new':
        final m = ChatMappers.fromEvent(data);
        if (m == null || !_follows(m.conversationId)) return;
        _write(m.conversationId, (data! as Map)['message']);
      case 'message:updated':
        if (data is Map && data['hiddenForMe'] == true) {
          final cid = data['conversationId'];
          final mid = data['messageId'];
          if (cid is! String || mid is! String || !_follows(cid)) return;
          final s = _synced[cid]!;
          _synced[cid] = s.withPins(
            [
              for (final p in s.pins.items)
                if (p.id != mid) p,
            ],
          );
          _queue(cid, () => _store()?.remove(cid, mid) ?? Future.value());
          return;
        }
        final m = ChatMappers.fromEvent(data);
        if (m == null || !_follows(m.conversationId)) return;
        // Kept in step exactly like the open chat does (ChatThread._apply).
        final s = _synced[m.conversationId]!;
        final pins = [
          for (final p in s.pins.items)
            if (p.id != m.id) p,
        ];
        if (m.pinned && !m.revoked) pins.insert(0, m);
        _synced[m.conversationId] = s.withPins(pins);
        _write(m.conversationId, (data! as Map)['message']);
      case 'conversation:update' || 'message:listened':
        final cid = data is Map ? data['conversationId'] : null;
        if (cid is String && !_open.contains(cid)) _synced.remove(cid);
    }
  }

  /// A closed chat whose copy is kept here.
  bool _follows(String id) => !_open.contains(id) && _synced.containsKey(id);

  void _write(String id, Object? raw) {
    if (_store() == null) {
      _synced.remove(id);
      return;
    }
    _queue(id, () => _store()!.putRaw(id, raw));
  }

  void _queue(String id, Future<void> Function() write) {
    final before = _writes[id] ?? Future<void>.value();
    final next = before.then((_) => write()).catchError((Object _) {
      // The phone's copy is no longer sure: the next open asks the server.
      _synced.remove(id);
    });
    _writes[id] = next;
    unawaited(
      next.whenComplete(() {
        if (identical(_writes[id], next)) _writes.remove(id);
      }),
    );
  }
}

class _Synced {
  const _Synced(this.epoch, this.pins, this.at);

  final int epoch;
  final ChatPins pins;
  final DateTime at;

  _Synced withPins(List<ChatMessage> items) => _Synced(
        epoch,
        ChatPins(
          items: items,
          editWindowMin: pins.editWindowMin,
          deleteForAllHours: pins.deleteForAllHours,
          maxPins: pins.maxPins,
        ),
        at,
      );
}
