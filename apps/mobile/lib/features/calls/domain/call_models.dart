import 'package:flutter/foundation.dart';

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

  String get name => displayName ?? (username == null ? '' : '@$username');
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
  });

  final String id;
  final String conversationId;
  final CallStatus status;
  final bool outgoing;
  final CallPeer peer;
  final DateTime createdAt;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final int? durationSec;

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
