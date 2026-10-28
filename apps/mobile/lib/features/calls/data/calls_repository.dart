import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/calls/application/livekit_call_media.dart'
    show LiveKitJoin;
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Why a call ends on this side (OQ-041).
enum CallEndReason { hangup, noAnswer, failed }

/// OQ-041 calls API for the app. Throws [ApiException].
abstract interface class CallsRepository {
  /// [video]: a video call — refused (FEATURE_DISABLED) unless the owner
  /// switched `video_calls` on and TURN is configured.
  Future<AppCall> start(String conversationId, {bool video = false});

  /// Phone / video buttons of a group chat.
  Future<AppCall> startGroup(
    String groupId, {
    bool video = false,
    List<String> userIds = const [],
  });

  /// The call running in the group, or null.
  Future<AppCall?> groupCall(String groupId);

  /// Owner 2026-10-21 (inbox 20e): the channel's call — its owner / an admin
  /// starts it (a running one is joined); nobody is rung.
  Future<AppCall> startChannel(String channelId, {bool video = false});

  /// The call running in the channel, or null.
  Future<AppCall?> channelCall(String channelId);

  /// Joins the call running in the group.
  Future<AppCall> join(String callId);
  Future<AppCall> accept(String callId);
  Future<AppCall> decline(String callId);
  Future<AppCall> end(
    String callId,
    CallEndReason reason, {
    bool forAll = false,
  });
  Future<AppCall> get(String callId);

  /// Owner 2026-10-28 (calls variant A): the call's LiveKit room —
  /// `POST /calls/{id}/livekit-token` (address + access token).
  Future<LiveKitJoin> livekitToken(String callId);

  /// Which media server the calls run on — `GET /calls/video`. This build
  /// talks to LiveKit only: false for anything else (the call is not
  /// started, the person is told). Any failure to ask answers true.
  Future<bool> providerSupported();

  /// Group calls: adds a person (by id or @username) to the running call.
  Future<AppCall> invite(String callId, {String? userId, String? username});

  /// Group calls, host only: switches [userId]'s microphone off / lets them
  /// switch it on.
  Future<AppCall> muteMember(
    String callId,
    String userId, {
    required bool muted,
  });

  /// Group calls, host only.
  Future<AppCall> removeMember(String callId, String userId);

  /// Our own microphone state, for the others' list.
  Future<void> setMuteState(String callId, {required bool muted});

  /// Group calls, nobody runs the call: propose to remove [userId].
  Future<AppCall> startVote(String callId, String userId);

  /// A ballot in the open vote.
  Future<AppCall> castVote(String callId, String voteId, {required bool favor});
}

class ApiCallsRepository implements CallsRepository {
  ApiCallsRepository(Dio dio) : _api = api.CallsClient(dio);

  final api.CallsClient _api;

  @override
  Future<AppCall> start(String conversationId, {bool video = false}) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.startCall(
            id: conversationId,
            body: video ? const api.StartCallDto(video: true) : null,
          ),
        ))
            .data,
      );

  @override
  Future<AppCall> startGroup(
    String groupId, {
    bool video = false,
    List<String> userIds = const [],
  }) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.startGroupCall(
            id: groupId,
            body: api.StartGroupCallDto(video: video, userIds: userIds),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall?> groupCall(String groupId) async {
    try {
      return CallMappers.call(
        (await guardApiCall(() => _api.groupCall(id: groupId))).data,
      );
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.callNotFound) return null;
      rethrow;
    }
  }

  @override
  Future<AppCall> startChannel(String channelId, {bool video = false}) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.startChannelCall(
            id: channelId,
            body: api.StartCallDto(video: video),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall?> channelCall(String channelId) async {
    try {
      return CallMappers.call(
        (await guardApiCall(() => _api.channelCall(id: channelId))).data,
      );
    } on ApiException catch (e) {
      if (e.code == ApiErrorCodes.callNotFound) return null;
      rethrow;
    }
  }

  @override
  Future<AppCall> join(String callId) async => CallMappers.call(
        (await guardApiCall(() => _api.joinCall(id: callId))).data,
      );

  @override
  Future<AppCall> accept(String callId) async => CallMappers.call(
        (await guardApiCall(() => _api.acceptCall(id: callId))).data,
      );

  @override
  Future<AppCall> decline(String callId) async => CallMappers.call(
        (await guardApiCall(() => _api.declineCall(id: callId))).data,
      );

  @override
  Future<AppCall> end(
    String callId,
    CallEndReason reason, {
    bool forAll = false,
  }) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.endCall(
            id: callId,
            body: api.EndCallDto(
              forAll: forAll ? true : null,
              reason: switch (reason) {
                CallEndReason.hangup => api.CallEndReason.hangup,
                CallEndReason.noAnswer => api.CallEndReason.noAnswer,
                CallEndReason.failed => api.CallEndReason.failed,
              },
            ),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall> get(String callId) async => CallMappers.call(
        (await guardApiCall(() => _api.getCall(id: callId))).data,
      );

  @override
  Future<AppCall> invite(
    String callId, {
    String? userId,
    String? username,
  }) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.inviteToCall(
            id: callId,
            body: api.InviteCallDto(userId: userId, username: username),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall> muteMember(
    String callId,
    String userId, {
    required bool muted,
  }) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.muteParticipant(
            id: callId,
            userId: userId,
            body: api.CallMuteDto(muted: muted),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall> startVote(String callId, String userId) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.startVote(
            id: callId,
            body: api.StartCallVoteDto(targetId: userId),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall> castVote(
    String callId,
    String voteId, {
    required bool favor,
  }) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.castVote(
            id: callId,
            voteId: voteId,
            body: api.CastCallVoteDto(favor: favor),
          ),
        ))
            .data,
      );

  @override
  Future<AppCall> removeMember(String callId, String userId) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.removeFromCall(id: callId, userId: userId),
        ))
            .data,
      );

  @override
  Future<void> setMuteState(String callId, {required bool muted}) async {
    await guardApiCall(
      () => _api.muteState(
        id: callId,
        body: api.CallMuteDto(muted: muted),
      ),
    );
  }

  @override
  Future<bool> providerSupported() async {
    try {
      final config = (await guardApiCall(_api.callVideoConfig)).data;
      return config.provider == api.VideoCallConfigDtoProvider.livekit;
    } on Object {
      return true;
    }
  }

  @override
  Future<LiveKitJoin> livekitToken(String callId) async {
    final d = (await guardApiCall(() => _api.livekitToken(id: callId))).data;
    return LiveKitJoin(url: d.url, token: d.token);
  }
}

abstract final class CallMappers {
  static AppCall call(api.CallDto d) => AppCall(
        id: d.id,
        conversationId: d.conversationId,
        groupId: d.groupId,
        channelId: d.channelId,
        status: CallStatus.values.firstWhere(
          (s) => s.name == d.status.json,
          orElse: () => CallStatus.failed,
        ),
        outgoing: d.outgoing,
        peer: CallPeer(
          id: d.peer.id,
          isAttorney: d.peer.kind == api.CallPeerDtoKind.attorney,
          displayName: d.peer.displayName,
          username: d.peer.username,
          avatarUrl: d.peer.avatarUrl,
        ),
        createdAt: d.createdAt,
        answeredAt: d.answeredAt,
        endedAt: d.endedAt,
        durationSec: d.durationSec,
        video: d.video,
        group: d.group,
        hostId: d.hostId,
        participants: d.participants.map(member).toList(),
        moderated: d.moderated,
        vote: d.vote == null ? null : voteOf(d.vote!),
        mediaProvider: mediaProviderOf(d.mediaProvider?.json),
        mediaFallback:
            d.mediaFallback == null ? null : fallbackOf(d.mediaFallback!),
      );

  static CallMediaProvider mediaProviderOf(String? raw) => raw == 'cloudflare'
      ? CallMediaProvider.cloudflare
      : CallMediaProvider.p2p;

  static CallMediaFallback fallbackOf(api.CallMediaFallbackDto f) =>
      CallMediaFallback(
        active: f.active,
        reason: f.reason?.json,
        videoBlocked: f.videoBlocked,
        videoMaxParticipants: f.videoMaxParticipants.toInt(),
      );

  static CallVote voteOf(api.CallVoteDto v) => CallVote(
        id: v.id,
        targetId: v.targetId,
        startedById: v.startedById,
        forCount: v.forCount,
        againstCount: v.againstCount,
        voters: v.voters,
        expiresAt: v.expiresAt,
        myBallot: v.myBallot,
      );

  /// A realtime `call:vote` payload: the open vote (null when it ended) and
  /// how it ended ('open' | 'passed' | 'failed').
  static ({String callId, String result, String targetId, CallVote? vote})?
      voteFromEvent(Object? data) {
    if (data is! Map ||
        data['callId'] is! String ||
        data['targetId'] is! String) {
      return null;
    }
    try {
      final v = data['vote'];
      return (
        callId: data['callId'] as String,
        result: '${data['result']}',
        targetId: data['targetId'] as String,
        vote: v is Map
            ? voteOf(api.CallVoteDto.fromJson(Map<String, Object?>.from(v)))
            : null,
      );
    } on Object {
      return null;
    }
  }

  static CallMember member(api.CallParticipantDto p) => CallMember(
        userId: p.userId,
        status: CallMemberStatus.values.firstWhere(
          (s) => s.name == p.status.json,
          orElse: () => CallMemberStatus.left,
        ),
        displayName: p.displayName,
        username: p.username,
        avatarUrl: p.avatarUrl,
        muted: p.muted,
        mutedByHost: p.mutedByHost,
        joinedAt: p.joinedAt,
        sfuTracks: p.sfuTracks == null
            ? null
            : {
                for (final t in p.sfuTracks!)
                  if (t.json != null) t.json!,
              },
      );

  /// A realtime `call:participants` payload. Besides the members it carries
  /// the media facts of the call (owner 2026-10-24): `mediaProvider`, the
  /// current `video` flag (it turns false when a crowded call drops to
  /// audio) and the outage `fallback`.
  static ({
    String callId,
    String? hostId,
    List<CallMember> members,
    CallMediaProvider? mediaProvider,
    bool? video,
    CallMediaFallback? fallback,
  })? participantsFromEvent(Object? data) {
    if (data is! Map || data['callId'] is! String) return null;
    final list = data['participants'];
    if (list is! List) return null;
    try {
      return (
        callId: data['callId'] as String,
        hostId: data['hostId'] as String?,
        members: [
          for (final p in list)
            member(
              api.CallParticipantDto.fromJson(
                Map<String, dynamic>.from(p as Map),
              ),
            ),
        ],
        mediaProvider: data['mediaProvider'] is String
            ? mediaProviderOf(data['mediaProvider'] as String)
            : null,
        video: data['video'] is bool ? data['video'] as bool : null,
        fallback: data['mediaFallback'] is Map
            ? fallbackOf(
                api.CallMediaFallbackDto.fromJson(
                  Map<String, Object?>.from(data['mediaFallback'] as Map),
                ),
              )
            : null,
      );
    } on Object {
      return null;
    }
  }

  /// A realtime `call:*` payload `{call: CallDto}`.
  static AppCall? fromEvent(Object? data) {
    if (data is! Map || data['call'] is! Map) return null;
    try {
      return call(
        api.CallDto.fromJson(Map<String, dynamic>.from(data['call'] as Map)),
      );
    } on Object {
      return null;
    }
  }
}

final callsRepositoryProvider = Provider<CallsRepository>(
  (ref) => ApiCallsRepository(ref.watch(dioProvider)),
);
