import 'package:flutter/foundation.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// How a finished call reads in the «Calls» tab (WhatsApp): the arrow and the
/// colour follow this.
enum CallHistoryKind { outgoing, incoming, missed }

/// Owner 2026-10-21: one finished call in the person's history.
@immutable
class CallHistoryEntry {
  const CallHistoryEntry({
    required this.id,
    required this.status,
    required this.outgoing,
    required this.video,
    required this.peer,
    required this.createdAt,
    this.conversationId,
    this.groupId,
    this.groupTitle,
    this.groupAvatarUrl,
    this.durationSec,
  });

  final String id;
  final CallStatus status;
  final bool outgoing;
  final bool video;
  final CallPeer peer;
  final DateTime createdAt;
  final String? conversationId;

  /// Set for a call started from a group chat.
  final String? groupId;
  final String? groupTitle;
  final String? groupAvatarUrl;
  final int? durationSec;

  bool get isGroup => groupId != null;

  /// A call that reached me and was not picked up (a call I declined myself
  /// is a normal incoming one, like in WhatsApp).
  CallHistoryKind get kind {
    if (outgoing) return CallHistoryKind.outgoing;
    return switch (status) {
      CallStatus.missed ||
      CallStatus.canceled ||
      CallStatus.busy ||
      CallStatus.failed =>
        CallHistoryKind.missed,
      _ => CallHistoryKind.incoming,
    };
  }

  /// Who it was with: the group, else the other person.
  String get otherId => groupId ?? peer.id;
}

/// Repeated calls with the same person / group, of the same kind and sort
/// (audio / video), on the same day, one line with a counter (WhatsApp).
@immutable
class CallHistoryGroup {
  const CallHistoryGroup(this.entries);

  /// Newest first; never empty.
  final List<CallHistoryEntry> entries;

  CallHistoryEntry get latest => entries.first;
  int get count => entries.length;
}

bool _sameDay(DateTime a, DateTime b) {
  final x = a.toLocal();
  final y = b.toLocal();
  return x.year == y.year && x.month == y.month && x.day == y.day;
}

/// Folds neighbouring repeats of [entries] (newest first) into lines.
List<CallHistoryGroup> groupCallHistory(List<CallHistoryEntry> entries) {
  final out = <List<CallHistoryEntry>>[];
  for (final e in entries) {
    final last = out.isEmpty ? null : out.last.first;
    if (last != null &&
        last.otherId == e.otherId &&
        last.kind == e.kind &&
        last.video == e.video &&
        _sameDay(last.createdAt, e.createdAt)) {
      out.last.add(e);
    } else {
      out.add([e]);
    }
  }
  return [for (final g in out) CallHistoryGroup(g)];
}

/// A group call running now in one of my groups.
@immutable
class OngoingGroupCall {
  const OngoingGroupCall({
    required this.id,
    required this.groupId,
    required this.groupTitle,
    required this.video,
    required this.joined,
    required this.mine,
    this.groupAvatarUrl,
  });

  final String id;
  final String groupId;
  final String groupTitle;
  final String? groupAvatarUrl;
  final bool video;
  final int joined;

  /// I am in it now («Return» instead of «Join»).
  final bool mine;
}
