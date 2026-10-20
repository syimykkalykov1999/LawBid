import 'package:flutter/foundation.dart';
import 'package:lawbid/core/text/bidi.dart';

/// OQ-041: server-side life of an in-app audio call.
enum CallStatus {
  ringing,
  active,
  ended,
  missed,
  declined,
  busy,
  canceled,
  failed
}

/// The other member of a call.
@immutable
class CallPeer {
  const CallPeer({
    required this.id,
    required this.isAttorney,
    this.displayName,
    this.username,
    this.avatarUrl,
  });

  final String id;
  final bool isAttorney;
  final String? displayName;
  final String? username;
  final String? avatarUrl;

  /// Never empty: a peer with no name and no username shows as the brand
  /// (the call screen, the notification and the system call UI never get
  /// a blank or "?").
  String get name {
    final n = displayName?.trim();
    if (n != null && n.isNotEmpty) return n;
    final u = username;
    return u == null || u.isEmpty ? 'LawBid' : atHandle(u);
  }
}

/// Where a person stands in a group call.
enum CallMemberStatus { invited, joined, declined, left, removed }

/// One person in a group call.
@immutable
class CallMember {
  const CallMember({
    required this.userId,
    required this.status,
    this.displayName,
    this.username,
    this.avatarUrl,
    this.muted = false,
    this.mutedByHost = false,
    this.joinedAt,
  });

  final String userId;
  final CallMemberStatus status;
  final String? displayName;
  final String? username;
  final String? avatarUrl;

  /// The microphone is off (their own choice or the host's).
  final bool muted;
  final bool mutedByHost;
  final DateTime? joinedAt;

  bool get joined => status == CallMemberStatus.joined;
  bool get ringing => status == CallMemberStatus.invited;

  /// Never empty (name, @username or the brand).
  String get name {
    final n = displayName?.trim();
    if (n != null && n.isNotEmpty) return n;
    final u = username;
    return u == null || u.isEmpty ? 'LawBid' : atHandle(u);
  }
}

@immutable
class AppCall {
  const AppCall({
    required this.id,
    required this.conversationId,
    required this.status,
    required this.outgoing,
    required this.peer,
    required this.createdAt,
    this.answeredAt,
    this.endedAt,
    this.durationSec,
    this.video = false,
    this.group = false,
    this.hostId,
    this.participants = const [],
  });

  /// Owner 2026-10-20: people were added; [participants] lists everyone.
  final bool group;

  /// Who can mute / remove others (group calls).
  final String? hostId;
  final List<CallMember> participants;

  /// Owner 2026-10-05: a video call (camera on both sides).
  final bool video;

  final String id;
  final String conversationId;
  final CallStatus status;
  final bool outgoing;
  final CallPeer peer;
  final DateTime createdAt;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final int? durationSec;

  AppCall copyWith({
    bool? group,
    String? hostId,
    List<CallMember>? participants,
  }) =>
      AppCall(
        id: id,
        conversationId: conversationId,
        status: status,
        outgoing: outgoing,
        peer: peer,
        createdAt: createdAt,
        answeredAt: answeredAt,
        endedAt: endedAt,
        durationSec: durationSec,
        video: video,
        group: group ?? this.group,
        hostId: hostId ?? this.hostId,
        participants: participants ?? this.participants,
      );

  bool get live => status == CallStatus.ringing || status == CallStatus.active;
}

/// One ICE server (STUN or TURN) for WebRTC.
@immutable
class IceServer {
  const IceServer({required this.urls, this.username, this.credential});

  final List<String> urls;
  final String? username;
  final String? credential;

  Map<String, Object?> toJson() => {
        'urls': urls,
        if (username != null) 'username': username,
        if (credential != null) 'credential': credential,
      };
}
