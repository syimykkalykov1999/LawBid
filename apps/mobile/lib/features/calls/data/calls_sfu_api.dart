import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-24: simulcast layers of a camera — full, half, quarter.
enum SfuRid { f, h, q }

/// `POST /calls/:id/sfu/session`.
class SfuSession {
  const SfuSession({required this.sessionId, required this.iceServers});

  final String sessionId;
  final List<IceServer> iceServers;
}

/// What a track we publish is called (the server's white list).
const kSfuMic = 'mic';
const kSfuCam = 'cam';

/// `POST /calls/:id/sfu/publish`.
class SfuPublishResult {
  const SfuPublishResult({
    required this.sdp,
    required this.tracks,
    required this.failed,
  });

  final String sdp;

  /// trackName by the mid of our offer.
  final Map<String, String> tracks;

  /// Track names the SFU refused (with the Cloudflare error code).
  final Map<String, String> failed;
}

/// One pulled track: whose it is and which of our transceivers carries it.
class SfuSubscription {
  const SfuSubscription({
    required this.userId,
    required this.trackName,
    required this.mid,
  });

  final String userId;
  final String trackName;
  final String mid;
}

/// `POST /calls/:id/sfu/subscribe`.
class SfuSubscribeResult {
  const SfuSubscribeResult({
    required this.requiresAnswer,
    required this.sdp,
    required this.subscriptions,
    required this.skipped,
  });

  /// True: [sdp] is the SFU's offer — apply it, answer it with `answer`.
  final bool requiresAnswer;
  final String? sdp;
  final List<SfuSubscription> subscriptions;

  /// `userId:trackName` -> reason (`not_in_call`, `not_published`,
  /// `already_pulled`, `batch_limit`, or a Cloudflare error code).
  final Map<String, String> skipped;

  bool get batchLimited => skipped.values.contains('batch_limit');
}

/// `POST /calls/:id/sfu/close`.
class SfuCloseResult {
  const SfuCloseResult({required this.closed, required this.sdp});

  final List<String> closed;

  /// The SFU's answer to the offer we sent, or null.
  final String? sdp;
}

/// The `/calls/:id/sfu/*` routes (design doc §11.4). Throws [ApiException].
abstract interface class CallsSfuApi {
  Future<SfuSession> session(String callId);

  Future<SfuPublishResult> publish(
    String callId, {
    required String sdp,
    required Map<String, String> trackNameByMid,
  });

  Future<SfuSubscribeResult> subscribe(
    String callId, {
    List<String>? userIds,
    List<String>? trackNames,
    SfuRid? rid,
  });

  Future<void> answer(String callId, String sdp);

  Future<SfuCloseResult> close(
    String callId, {
    List<String>? trackNames,
    List<String>? userIds,
    String? sdp,
  });

  /// Simulcast layer of the camera we pull from [userId].
  Future<void> layer(
    String callId, {
    required String userId,
    required SfuRid rid,
  });
}

class ApiCallsSfuApi implements CallsSfuApi {
  ApiCallsSfuApi(Dio dio) : _api = api.CallsClient(dio);

  final api.CallsClient _api;

  @override
  Future<SfuSession> session(String callId) async {
    final d = (await guardApiCall(() => _api.sfuSession(id: callId))).data;
    return SfuSession(
      sessionId: d.sessionId,
      iceServers: [for (final s in d.iceServers) IceServer(urls: s.urls)],
    );
  }

  @override
  Future<SfuPublishResult> publish(
    String callId, {
    required String sdp,
    required Map<String, String> trackNameByMid,
  }) async {
    final d = (await guardApiCall(
      () => _api.sfuPublish(
        id: callId,
        body: api.SfuPublishDto(
          sdp: sdp,
          tracks: [
            for (final e in trackNameByMid.entries)
              api.SfuPublishTrackDto(
                mid: e.key,
                trackName: e.value == kSfuCam
                    ? api.SfuPublishTrackDtoTrackName.cam
                    : api.SfuPublishTrackDtoTrackName.mic,
              ),
          ],
        ),
      ),
    ))
        .data;
    return SfuPublishResult(
      sdp: d.sdp,
      tracks: {for (final t in d.tracks) t.mid: t.trackName.json ?? ''},
      failed: {for (final f in d.failed) f.trackName: f.errorCode},
    );
  }

  @override
  Future<SfuSubscribeResult> subscribe(
    String callId, {
    List<String>? userIds,
    List<String>? trackNames,
    SfuRid? rid,
  }) async {
    final d = (await guardApiCall(
      () => _api.sfuSubscribe(
        id: callId,
        body: api.SfuSubscribeDto(
          userIds: userIds,
          trackNames: trackNames == null
              ? null
              : [
                  for (final n in trackNames)
                    n == kSfuCam
                        ? api.SfuSubscribeDtoTrackNames.cam
                        : api.SfuSubscribeDtoTrackNames.mic,
                ],
          rid: rid == null
              ? null
              : switch (rid) {
                  SfuRid.f => api.SfuSubscribeDtoRid.f,
                  SfuRid.h => api.SfuSubscribeDtoRid.h,
                  SfuRid.q => api.SfuSubscribeDtoRid.q,
                },
        ),
      ),
    ))
        .data;
    return SfuSubscribeResult(
      requiresAnswer: d.requiresAnswer,
      sdp: d.sdp,
      subscriptions: [
        for (final s in d.subscriptions)
          SfuSubscription(
            userId: s.userId,
            trackName: s.trackName.json ?? '',
            mid: s.mid,
          ),
      ],
      skipped: {
        for (final s in d.skipped) '${s.userId}:${s.trackName}': s.reason,
      },
    );
  }

  @override
  Future<void> answer(String callId, String sdp) async {
    await guardApiCall(
      () => _api.sfuAnswer(
        id: callId,
        body: api.SfuAnswerDto(sdp: sdp),
      ),
    );
  }

  @override
  Future<SfuCloseResult> close(
    String callId, {
    List<String>? trackNames,
    List<String>? userIds,
    String? sdp,
  }) async {
    final d = (await guardApiCall(
      () => _api.sfuClose(
        id: callId,
        body: api.SfuCloseDto(
          trackNames: trackNames == null
              ? null
              : [
                  for (final n in trackNames)
                    n == kSfuCam
                        ? api.SfuCloseDtoTrackNames.cam
                        : api.SfuCloseDtoTrackNames.mic,
                ],
          userIds: userIds,
          sdp: sdp,
        ),
      ),
    ))
        .data;
    return SfuCloseResult(closed: d.closed, sdp: d.sdp);
  }

  @override
  Future<void> layer(
    String callId, {
    required String userId,
    required SfuRid rid,
  }) async {
    await guardApiCall(
      () => _api.sfuLayer(
        id: callId,
        body: api.SfuLayerDto(
          userId: userId,
          rid: switch (rid) {
            SfuRid.f => api.SfuLayerDtoRid.f,
            SfuRid.h => api.SfuLayerDtoRid.h,
            SfuRid.q => api.SfuLayerDtoRid.q,
          },
        ),
      ),
    );
  }
}

final callsSfuApiProvider = Provider<CallsSfuApi>(
  (ref) => ApiCallsSfuApi(ref.watch(dioProvider)),
);
