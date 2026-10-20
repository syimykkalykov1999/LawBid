import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
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

  /// Joins the call running in the group.
  Future<AppCall> join(String callId);
  Future<AppCall> accept(String callId);
  Future<AppCall> decline(String callId);
  Future<AppCall> end(String callId, CallEndReason reason);
  Future<AppCall> get(String callId);
  Future<List<IceServer>> iceServers();

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
  Future<AppCall> end(String callId, CallEndReason reason) async =>
      CallMappers.call(
        (await guardApiCall(
          () => _api.endCall(
            id: callId,
            body: api.EndCallDto(
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
  Future<List<IceServer>> iceServers() async =>
      (await guardApiCall(_api.callIceServers))
          .data
          .iceServers
          .map(
            (s) => IceServer(
              urls: s.urls,
              username: s.username,
              credential: s.credential,
            ),
          )
          .toList();
}

abstract final class CallMappers {
  static AppCall call(api.CallDto d) => AppCall(
        id: d.id,
        conversationId: d.conversationId,
        groupId: d.groupId,
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
      );

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
      );

  /// A realtime `call:participants` payload.
  static ({String callId, String? hostId, List<CallMember> members})?
      participantsFromEvent(Object? data) {
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
