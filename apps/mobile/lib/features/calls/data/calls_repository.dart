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
  Future<AppCall> start(String conversationId);
  Future<AppCall> accept(String callId);
  Future<AppCall> decline(String callId);
  Future<AppCall> end(String callId, CallEndReason reason);
  Future<AppCall> get(String callId);
  Future<List<IceServer>> iceServers();
}

class ApiCallsRepository implements CallsRepository {
  ApiCallsRepository(Dio dio) : _api = api.CallsClient(dio);

  final api.CallsClient _api;

  @override
  Future<AppCall> start(String conversationId) async => CallMappers.call(
        (await guardApiCall(() => _api.startCall(id: conversationId))).data,
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
      );

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
