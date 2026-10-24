import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/chat/chat_routes.dart';

/// Owner 2026-10-23 (WhatsApp / Telegram): a call that is going on and that
/// I am in (minimised) or can join. It replaces the green banner over every
/// screen: the Calls tab pins these on top, and Chats shows a call button
/// while any exist.
class LiveCall {
  const LiveCall({
    required this.id,
    required this.title,
    required this.joined,
    required this.video,
    required this.mine,
    this.avatarUrl,
    this.startedAt,
    this.group,
  });

  /// The call id.
  final String id;
  final String title;
  final String? avatarUrl;

  /// People in it now.
  final int joined;
  final bool video;

  /// I am in it (the button says «Return»).
  final bool mine;

  /// Since when it runs (the length so far); null = unknown.
  final DateTime? startedAt;

  /// The server's row for a call in one of my groups; null = the call this
  /// phone is in right now (one-to-one, or made a group by adding people).
  final OngoingGroupCall? group;
}

/// The calls going on: the server's list (calls in my groups) and the call
/// this phone is in. Ends the moment the call ends: the server's
/// `call:ongoing_ended` and `call:ended` events drive both sources; the list
/// is re-read on a reconnect and every few minutes while a call is known.
final liveCallsProvider = Provider.autoDispose<List<LiveCall>>((ref) {
  final server = ref.watch(ongoingGroupCallsProvider).value ?? const [];
  final s = ref.watch(callControllerProvider);
  final me = ref.watch(callMyIdProvider);
  final videoOn = ref.watch(videoCallsEnabledProvider);
  final local = s.call;
  final inCall = s.phase == CallPhase.connecting || s.phase == CallPhase.active;
  final out = <LiveCall>[];
  var haveLocal = false;
  for (final c in server) {
    // A video call needs the `video_calls` switch to be on.
    if (c.video && !videoOn && !c.mine) continue;
    final isThis = inCall && local != null && local.id == c.id;
    haveLocal = haveLocal || isThis;
    out.add(
      LiveCall(
        id: c.id,
        title: c.groupTitle,
        avatarUrl: c.groupAvatarUrl,
        joined: c.joined,
        video: c.video,
        mine: c.mine || isThis,
        startedAt: isThis ? (s.connectedAt ?? c.startedAt) : c.startedAt,
        group: c,
      ),
    );
  }
  if (inCall && local != null && !haveLocal) {
    final peer = s.peer ?? local.peer;
    final people = local.participants.where((m) => m.joined).length;
    out.insert(
      0,
      LiveCall(
        id: local.id,
        title: callLabel(s, me),
        avatarUrl: peer.avatarUrl,
        joined: people > 0 ? people : 2,
        video: s.video,
        mine: true,
        startedAt: s.connectedAt,
      ),
    );
  }
  return out;
});

/// «Join» / «Return» on the call. Returns the API error code (or `kMicDenied`),
/// null when it worked or the call had just ended. Every server rule (blocked
/// people, call permissions, the `video_calls` flag, the group's size limit)
/// is applied by the join request itself.
final joinLiveCallProvider =
    Provider<Future<String?> Function(LiveCall call, GoRouter? router)>(
  (ref) => (call, router) async {
    final server = call.group;
    final s = ref.read(callControllerProvider);
    // The call this phone is in: just open its screen again.
    if (server == null || (call.mine && s.busy && s.call?.id == call.id)) {
      if (router != null) await router.push<void>(ChatRoutes.call);
      return null;
    }
    return ref.read(joinOngoingGroupCallProvider)(server);
  },
);
