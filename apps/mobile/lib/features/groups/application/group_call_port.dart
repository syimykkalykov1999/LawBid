import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

/// One person in a running call, as people outside it see them (owner
/// 2026-10-21, inbox 20f: Telegram's video chat list before joining).
class RunningCallMember {
  const RunningCallMember({
    required this.userId,
    required this.name,
    this.avatarUrl,
    this.muted = false,
    this.host = false,
  });

  final String userId;

  /// Never empty (name, @username or the brand).
  final String name;
  final String? avatarUrl;

  /// The microphone is off.
  final bool muted;

  /// Runs the call (mutes / removes, ends it for everyone).
  final bool host;
}

/// A call running in a group chat or a channel (what the «Join» bar needs).
class GroupRunningCall {
  const GroupRunningCall({
    required this.video,
    required this.join,
    this.members = 0,
    this.people = const [],
    this.returning = false,
  });

  final bool video;

  /// How many people are in the call now.
  final int members;

  /// The people in the call now, host first.
  final List<RunningCallMember> people;

  /// We were in this call (left it, or are in it): «Return», not «Join».
  final bool returning;

  /// Joins it; returns the API error code, or null when it worked.
  final Future<String?> Function(String title, String? avatarUrl) join;
}

/// What a group chat or a channel needs from the calls feature (the feature
/// boundaries forbid importing it): start a call, find the one running.
/// Provided in `run_app.dart`; null in tests.
class GroupCallPort {
  const GroupCallPort({
    required this.start,
    required this.running,
    this.startChannel,
    this.runningChannel,
  });

  /// Phone / video button: rings `userIds`; returns the API error code, or
  /// null when it worked.
  final Future<String?> Function(
    String groupId, {
    required String title,
    String? avatarUrl,
    bool video,
    List<String> userIds,
  }) start;

  /// The call running in `groupId`, else null.
  final Future<GroupRunningCall?> Function(String groupId) running;

  /// Owner 2026-10-21 (inbox 20e): the channel's owner / an admin starts its
  /// call; nobody is rung. Returns the API error code, or null.
  final Future<String?> Function(
    String channelId, {
    required String title,
    String? avatarUrl,
    bool video,
  })? startChannel;

  /// The call running in `channelId`, else null.
  final Future<GroupRunningCall?> Function(String channelId)? runningChannel;
}

final groupCallPortProvider = Provider<GroupCallPort?>((ref) => null);

/// Owner 2026-10-22 (load audit finding 3): with no event for this long
/// while a call is known to run, the bar is read again (a lost event).
const kRunningCallSafetyRefresh = Duration(minutes: 5);

/// Owner 2026-10-22 (load audit finding 3): the bar is read when the chat /
/// channel opens and after a reconnect, then again only when the server
/// pushes that its call started, changed or ended (`call:ongoing`,
/// `call:ongoing_ended`) — the screens used to ask every 10 s. [ours] picks
/// this chat's events.
void _followCallEvents(Ref ref, bool Function(Map<Object?, Object?>) ours) {
  final sub = ref.watch(realtimeEventsProvider).listen((e) {
    final data = e.data;
    if (e.name == RealtimeEvent.reconnected ||
        ((e.name == 'call:ongoing' || e.name == 'call:ongoing_ended') &&
            data is Map &&
            ours(data))) {
      ref.invalidateSelf();
    }
  });
  ref.onDispose(sub.cancel);
}

/// A very slow re-read, only while a call is known to run.
void _safetyRefresh(Ref ref) {
  final timer = Timer(kRunningCallSafetyRefresh, ref.invalidateSelf);
  ref.onDispose(timer.cancel);
}

/// The call running in a group (null = none). Group members hear its
/// changes in their own socket room.
final groupRunningCallProvider =
    FutureProvider.autoDispose.family<GroupRunningCall?, String>(
  (ref, groupId) async {
    _followCallEvents(ref, (d) => d['groupId'] == groupId);
    final call = await (ref.watch(groupCallPortProvider)?.running(groupId) ??
        Future<GroupRunningCall?>.value());
    if (call != null) _safetyRefresh(ref);
    return call;
  },
);

/// The open channel's socket room: a channel may have thousands of
/// subscribers, so only the phones that have it open hear its call
/// (`channel:watch`, re-sent after a reconnect by the client).
final _channelWatchProvider = Provider.autoDispose.family<void, String>(
  (ref, channelId) {
    final rt = ref.watch(realtimeClientProvider);
    rt?.watchChannel(channelId);
    ref.onDispose(() => rt?.unwatchChannel(channelId));
  },
);

/// The call running in a channel (null = none), followed while it is open.
final channelRunningCallProvider =
    FutureProvider.autoDispose.family<GroupRunningCall?, String>(
  (ref, channelId) async {
    ref.watch(_channelWatchProvider(channelId));
    _followCallEvents(ref, (d) => d['channelId'] == channelId);
    final call = await (ref
            .watch(groupCallPortProvider)
            ?.runningChannel
            ?.call(channelId) ??
        Future<GroupRunningCall?>.value());
    if (call != null) _safetyRefresh(ref);
    return call;
  },
);

/// Whether the video button may show (the flag and TURN keys are on).
final groupVideoCallsProvider = Provider<bool>((ref) => false);
