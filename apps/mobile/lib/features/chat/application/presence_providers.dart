import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A chat partner's activity: online now, or when last seen.
class PresenceView {
  const PresenceView({required this.online, this.lastSeenAt});

  final bool online;
  final DateTime? lastSeenAt;
}

/// Owner 2026-10-01: live online / last seen of [userId] while a chat with
/// them is open (`presence:watch` + `presence:update`). Null = not shown
/// (either side hides their activity status, a block, not watchable).
class PresenceNotifier extends Notifier<PresenceView?> {
  PresenceNotifier(this.userId);

  final String userId;

  @override
  PresenceView? build() {
    final realtime = ref.watch(realtimeClientProvider);
    if (realtime == null) return null;
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      unawaited(sub.cancel());
      realtime.unwatchPresence(userId);
    });
    unawaited(
      realtime.watchPresence(userId).then((r) {
        if (!ref.mounted || r == null || r['ok'] != true) return;
        if (r['visible'] != true) {
          state = null;
          return;
        }
        state = PresenceView(
          online: r['online'] == true,
          lastSeenAt: DateTime.tryParse('${r['lastSeenAt']}'),
        );
      }),
    );
    return null;
  }

  void _onEvent(RealtimeEvent e) {
    if (e.name != 'presence:update') return;
    final d = e.data;
    if (d is! Map || d['userId'] != userId) return;
    state = PresenceView(
      online: d['online'] == true,
      lastSeenAt: DateTime.tryParse('${d['lastSeenAt']}') ?? state?.lastSeenAt,
    );
  }
}

final presenceProvider = NotifierProvider.autoDispose
    .family<PresenceNotifier, PresenceView?, String>(PresenceNotifier.new);

/// "online" / "last seen 5 min ago" / "last seen yesterday at 9:14 PM".
String presenceLabel(
  Translator t,
  PresenceView p, {
  required String Function(DateTime) time,
  required String Function(DateTime) date,
  DateTime? now,
}) {
  if (p.online) return t.t('presence.online');
  final seen = p.lastSeenAt?.toLocal();
  if (seen == null) return t.t('presence.recently');
  final n = now ?? DateTime.now();
  final diff = n.difference(seen);
  if (diff.inMinutes < 1) return t.t('presence.justNow');
  if (diff.inMinutes < 60) {
    return t.t('presence.minutes', {'n': '${diff.inMinutes}'});
  }
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(seen.year, seen.month, seen.day);
  if (day == today) return t.t('presence.todayAt', {'time': time(seen)});
  if (day == today.subtract(const Duration(days: 1))) {
    return t.t('presence.yesterdayAt', {'time': time(seen)});
  }
  return t.t('presence.on', {'date': date(seen)});
}

/// Owner 2026-10-01: Settings → "Show activity status" (reciprocal).
class ActivityStatusNotifier extends AsyncNotifier<bool> {
  api.PresenceClient get _api => api.PresenceClient(ref.read(dioProvider));

  @override
  Future<bool> build() async =>
      (await guardApiCall(_api.getActivityStatus)).data.showActivityStatus;

  // ignore: avoid_positional_boolean_parameters
  Future<void> set(bool show) async {
    final before = state.value;
    state = AsyncData(show);
    try {
      await guardApiCall(
        () => _api.setActivityStatus(
          body: api.ActivityStatusDto(showActivityStatus: show),
        ),
      );
      // Audit 2026-10-02: the chat list's online dots follow the rule
      // (it's reciprocal: off = you don't see others either).
      ref.invalidate(conversationsProvider);
    } on Object {
      state = AsyncData(before ?? !show);
      rethrow;
    }
  }
}

final activityStatusProvider =
    AsyncNotifierProvider.autoDispose<ActivityStatusNotifier, bool>(
  ActivityStatusNotifier.new,
);

/// Owner 2026-10-01: chats where the other side is typing right now (the
/// chat list shows "typing…"); an entry goes out after a few quiet seconds.
class ListTypingNotifier extends Notifier<Set<String>> {
  final Map<String, Timer> _timers = {};

  @override
  Set<String> build() {
    final sub = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      unawaited(sub.cancel());
      for (final t in _timers.values) {
        t.cancel();
      }
      _timers.clear();
    });
    return const {};
  }

  void _onEvent(RealtimeEvent e) {
    final d = e.data;
    // A new message ends "typing" at once.
    if (e.name == 'message:new' && d is Map) {
      final id = d['conversationId'];
      if (id is String) _set(id, typing: false);
      return;
    }
    if (e.name != 'typing' || d is! Map) return;
    final id = d['conversationId'];
    if (id is! String) return;
    _set(id, typing: d['typing'] == true);
  }

  void _set(String id, {required bool typing}) {
    _timers.remove(id)?.cancel();
    if (typing) {
      _timers[id] = Timer(const Duration(seconds: 6), () {
        _timers.remove(id);
        if (ref.mounted) state = {...state}..remove(id);
      });
      if (!state.contains(id)) state = {...state, id};
    } else if (state.contains(id)) {
      state = {...state}..remove(id);
    }
  }
}

final listTypingProvider =
    NotifierProvider<ListTypingNotifier, Set<String>>(ListTypingNotifier.new);
