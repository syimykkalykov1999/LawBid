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

/// Owner 2026-10-21: the open vote to remove a member of a group call.
@immutable
class CallVote {
  const CallVote({
    required this.id,
    required this.targetId,
    required this.startedById,
    required this.forCount,
    required this.againstCount,
    required this.voters,
    required this.expiresAt,
    this.myBallot,
  });

  final String id;
  final String targetId;
  final String startedById;
  final int forCount;
  final int againstCount;

  /// Members who vote now (in the call, minus the candidate).
  final int voters;
  final DateTime expiresAt;

  /// Our own ballot; null = not voted.
  final bool? myBallot;
}

class AppCall {
  const AppCall({
    required this.id,
    required this.conversationId,
    required this.status,
    required this.outgoing,
    required this.peer,
    required this.createdAt,
    this.groupId,
    this.answeredAt,
    this.endedAt,
    this.durationSec,
    this.video = false,
    this.group = false,
    this.hostId,
    this.participants = const [],
    this.moderated = true,
    this.vote,
  });

  /// Somebody who runs the call (starter / group admin) is in it — members
  /// cannot vote to remove anyone then.
  final bool moderated;

  /// The open vote to remove a member, if any.
  final CallVote? vote;

  /// Owner 2026-10-20: people were added; [participants] lists everyone.
  final bool group;

  /// Who can mute / remove others (group calls).
  final String? hostId;
  final List<CallMember> participants;

  /// Owner 2026-10-05: a video call (camera on both sides).
  final bool video;

  final String id;

  /// Null for a call started from a group chat ([groupId] is set then).
  final String? conversationId;
  final String? groupId;
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
    bool? moderated,
    CallVote? vote,
    bool clearVote = false,
  }) =>
      AppCall(
        id: id,
        conversationId: conversationId,
        groupId: groupId,
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
        moderated: moderated ?? this.moderated,
        vote: clearVote ? null : vote ?? this.vote,
      );

  bool get live => status == CallStatus.ringing || status == CallStatus.active;

  /// The most people the call holds (server GROUP_MAX_AUDIO / _VIDEO).
  int get capacity => video ? callMaxVideo : callMaxAudio;

  /// People in the call or ringing — what the server counts against
  /// [capacity] (a one-to-one call is two).
  int get size => group
      ? participants
          .where(
            (m) =>
                m.status == CallMemberStatus.joined ||
                m.status == CallMemberStatus.invited,
          )
          .length
      : 2;

  bool get full => size >= capacity;
}

/// Mesh calls: the server's GROUP_MAX_AUDIO / GROUP_MAX_VIDEO.
const callMaxAudio = 9;
const callMaxVideo = 6;

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
