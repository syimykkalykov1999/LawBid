import 'package:flutter/foundation.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// One face of a running call (the bar and the list row show up to three).
@immutable
class CallFace {
  const CallFace({required this.userId, this.name, this.avatarUrl});

  final String userId;
  final String? name;
  final String? avatarUrl;
}

/// Owner 2026-10-21 (inbox 20e/20f, Telegram «Видеочат»): the call running
/// in a group or a channel, as its row in the Groups | Channels lists shows
/// it («Call in progress · N» with the first faces).
@immutable
class OngoingCallSummary {
  const OngoingCallSummary({
    required this.id,
    required this.video,
    required this.count,
    this.faces = const [],
  });

  final String id;
  final bool video;

  /// People in the call now.
  final int count;
  final List<CallFace> faces;

  static OngoingCallSummary? fromDto(api.OngoingCallDto? d) => d == null
      ? null
      : OngoingCallSummary(
          id: d.id,
          video: d.video,
          count: d.participantCount.toInt(),
          faces: [
            for (final p in d.participants)
              CallFace(
                userId: p.userId,
                name: p.displayName,
                avatarUrl: p.avatarUrl,
              ),
          ],
        );
}
