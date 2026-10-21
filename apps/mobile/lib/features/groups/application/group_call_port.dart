import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

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

/// The call running in a group (null = none); the chat refreshes it.
final groupRunningCallProvider =
    FutureProvider.autoDispose.family<GroupRunningCall?, String>(
  (ref, groupId) async =>
      ref.watch(groupCallPortProvider)?.running(groupId) ?? Future.value(),
);

/// The call running in a channel (null = none); the channel refreshes it.
final channelRunningCallProvider =
    FutureProvider.autoDispose.family<GroupRunningCall?, String>(
  (ref, channelId) async =>
      ref.watch(groupCallPortProvider)?.runningChannel?.call(channelId) ??
      Future.value(),
);

/// Whether the video button may show (the flag and TURN keys are on).
final groupVideoCallsProvider = Provider<bool>((ref) => false);
