import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// A call running in a group chat (what the «Join» bar needs).
class GroupRunningCall {
  const GroupRunningCall({required this.video, required this.join});

  final bool video;

  /// Joins it; returns the API error code, or null when it worked.
  final Future<String?> Function(String title, String? avatarUrl) join;
}

/// What a group chat needs from the calls feature (the feature boundaries
/// forbid importing it): start a call, find the one running. Provided in
/// `run_app.dart`; null in tests.
class GroupCallPort {
  const GroupCallPort({required this.start, required this.running});

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
}

final groupCallPortProvider = Provider<GroupCallPort?>((ref) => null);

/// The call running in a group (null = none); the chat refreshes it.
final groupRunningCallProvider =
    FutureProvider.autoDispose.family<GroupRunningCall?, String>(
  (ref, groupId) async =>
      ref.watch(groupCallPortProvider)?.running(groupId) ?? Future.value(),
);

/// Whether the video button may show (the flag and TURN keys are on).
final groupVideoCallsProvider = Provider<bool>((ref) => false);
