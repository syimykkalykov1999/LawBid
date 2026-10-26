import 'dart:async';

import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show ChatMappers;

/// The folder badges (Waiting / Requests) used to be re-read from the server
/// on every message. They change only when a chat flips between «waiting for
/// my answer» and not, or when a chat gets its first message; so a message
/// that changes neither costs no request, and the rest is debounced.
const kChatCountsDebounce = Duration(seconds: 2);

class ChatCountsGate {
  ChatCountsGate({required this.me});

  final String? Function() me;

  /// Who wrote the last message of each chat seen on the socket
  /// (true = me); a chat seen for the first time may be a new request.
  final Map<String, bool> _lastMine = {};

  /// Waiting folder: the last message's side flipped (or unknown chat).
  /// Requests count: only a chat not seen before can add one.
  ({bool waiting, bool requests}) onMessage(RealtimeEvent e) {
    final m = ChatMappers.fromEvent(e.data);
    if (m == null) return (waiting: false, requests: false);
    final id = me();
    final mine = id != null && m.senderId == id;
    final prev = _lastMine[m.conversationId];
    _lastMine[m.conversationId] = mine;
    return (waiting: prev != mine, requests: prev == null);
  }
}

/// Calls [refresh] once after [delay] of quiet.
class CountsDebouncer {
  CountsDebouncer(this.refresh, {this.delay = kChatCountsDebounce});

  final void Function() refresh;
  final Duration delay;
  Timer? _t;

  void poke() {
    _t?.cancel();
    _t = Timer(delay, refresh);
  }

  void dispose() => _t?.cancel();
}
