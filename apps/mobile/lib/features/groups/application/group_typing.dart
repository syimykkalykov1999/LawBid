import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Who is typing in a group right now (detective D1-2, 13.11): Telegram and
/// WhatsApp show «Anna is typing…» in a group header. The server sends
/// `typing {conversationId, userId, typing, kind}` to the open group room
/// (never to the typer's own devices); one typer stopping clears only them.
typedef GroupTyper = ({String userId, bool voice});

class GroupTyping extends Notifier<GroupTyper?> {
  GroupTyping(this.groupId);

  final String groupId;

  /// userId -> voice; the order is the order they started (latest last).
  final Map<String, bool> _typers = {};
  final Map<String, Timer> _timers = {};
  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  GroupTyper? build() {
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      sub.cancel();
      for (final t in _timers.values) {
        t.cancel();
      }
    });
    return null;
  }

  void _onEvent(RealtimeEvent e) {
    final d = e.data;
    if (d is! Map) return;
    if (e.name == 'group:message') {
      // A new message ends its sender's «typing…» at once.
      final m = d['message'];
      final sender = m is Map ? m['sender'] : null;
      final uid = sender is Map ? sender['userId'] : null;
      if (d['groupId'] == groupId && uid is String) _drop(uid);
      return;
    }
    if (e.name != 'typing' || d['conversationId'] != groupId) return;
    final uid = d['userId'];
    if (uid is! String || uid == ref.read(currentUserIdProvider)) return;
    if (d['typing'] != true) return _drop(uid);
    _typers
      ..remove(uid)
      ..[uid] = d['kind'] == 'voice';
    _timers.remove(uid)?.cancel();
    // §8.5: typing lives 5 s without a new event.
    _timers[uid] = Timer(const Duration(seconds: 5), () => _drop(uid));
    _emit();
  }

  void _drop(String uid) {
    _timers.remove(uid)?.cancel();
    if (_typers.remove(uid) != null) _emit();
  }

  void _emit() {
    if (!ref.mounted) return;
    state = _typers.isEmpty
        ? null
        : (userId: _typers.keys.last, voice: _typers.values.last);
  }

  /// My own «typing…» to the group, at most every 2 s (as in 1:1 chats).
  // ignore: avoid_positional_boolean_parameters
  void send(bool active) {
    final rt = ref.read(realtimeClientProvider);
    if (rt == null) return;
    final now = DateTime.now();
    if (active && now.difference(_lastSent) < const Duration(seconds: 2)) {
      return;
    }
    _lastSent = active ? now : DateTime.fromMillisecondsSinceEpoch(0);
    rt.typing(groupId, active: active);
  }
}

final groupTypingProvider = NotifierProvider.autoDispose
    .family<GroupTyping, GroupTyper?, String>(GroupTyping.new);
