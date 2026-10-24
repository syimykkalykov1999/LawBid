import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart'
    show MediaStream, MediaStreamTrack, StatsReport;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/sfu_rtc.dart';
import 'package:lawbid/features/calls/data/calls_sfu_api.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// Owner 2026-10-24: fakes for the Cloudflare SFU client — the API, the
/// PeerConnection layer and the capture — so publish, pull, layers and
/// reconnect run without WebRTC or a server.

class FakeTrack extends Fake implements MediaStreamTrack {
  FakeTrack(this.kind, this.id);

  @override
  final String kind;
  @override
  final String id;
  @override
  bool enabled = true;
  bool stopped = false;

  @override
  Future<void> stop() async => stopped = true;
}

class FakeStream extends Fake implements MediaStream {
  FakeStream(this.id, [List<FakeTrack> tracks = const []])
      : _tracks = [...tracks];

  @override
  final String id;
  final List<FakeTrack> _tracks;
  bool disposed = false;

  @override
  List<MediaStreamTrack> getTracks() => List.of(_tracks);

  @override
  List<MediaStreamTrack> getAudioTracks() => [
        for (final t in _tracks)
          if (t.kind == 'audio') t
      ];

  @override
  List<MediaStreamTrack> getVideoTracks() => [
        for (final t in _tracks)
          if (t.kind == 'video') t
      ];

  @override
  Future<void> addTrack(MediaStreamTrack track,
          {bool addToNative = true}) async =>
      _tracks.add(track as FakeTrack);

  @override
  Future<void> removeTrack(
    MediaStreamTrack track, {
    bool removeFromNative = true,
  }) async =>
      _tracks.remove(track);

  @override
  Future<void> dispose() async => disposed = true;
}

/// One call to the `/sfu/*` routes, for assertions.
class SfuCall {
  const SfuCall(this.name, [this.args = const {}]);
  final String name;
  final Map<String, Object?> args;
  @override
  String toString() => '$name$args';
}

class FakeSfuApi implements CallsSfuApi {
  final calls = <SfuCall>[];
  int sessions = 0;
  int _mid = 0;

  /// What the SFU says someone publishes (userId -> trackNames); a subscribe
  /// gives each a fresh mid per track.
  Object? failNext;
  int failPublish = 0;
  bool offerOnSubscribe = true;
  int batchLimitOnce = 0;
  Completer<void>? gate;

  List<SfuCall> named(String n) => [
        for (final c in calls)
          if (c.name == n) c
      ];

  @override
  Future<SfuSession> session(String callId) async {
    calls.add(const SfuCall('session'));
    sessions++;
    return SfuSession(
      sessionId: 's$sessions',
      iceServers: const [
        IceServer(urls: ['stun:stun.cloudflare.com:3478']),
      ],
    );
  }

  @override
  Future<SfuPublishResult> publish(
    String callId, {
    required String sdp,
    required Map<String, String> trackNameByMid,
  }) async {
    calls.add(SfuCall('publish', {'mids': Map.of(trackNameByMid)}));
    if (failPublish > 0) {
      failPublish--;
      throw StateError('publish refused');
    }
    _maybeFail();
    return SfuPublishResult(
      sdp: 'answer-of-$sdp',
      tracks: Map.of(trackNameByMid),
      failed: const {},
    );
  }

  @override
  Future<SfuSubscribeResult> subscribe(
    String callId, {
    List<String>? userIds,
    List<String>? trackNames,
    SfuRid? rid,
  }) async {
    calls.add(
      SfuCall('subscribe', {
        'users': userIds,
        'names': trackNames,
        'rid': rid?.name,
      }),
    );
    await gate?.future;
    _maybeFail();
    final subs = <SfuSubscription>[];
    for (final u in userIds ?? const <String>[]) {
      for (final n in trackNames ?? const ['mic', 'cam']) {
        subs.add(SfuSubscription(userId: u, trackName: n, mid: 'r${_mid++}'));
      }
    }
    var skipped = const <String, String>{};
    if (batchLimitOnce > 0) {
      batchLimitOnce--;
      skipped = {'x:cam': 'batch_limit'};
    }
    return SfuSubscribeResult(
      requiresAnswer: offerOnSubscribe && subs.isNotEmpty,
      sdp: offerOnSubscribe && subs.isNotEmpty ? 'sfu-offer' : null,
      subscriptions: subs,
      skipped: skipped,
    );
  }

  @override
  Future<void> answer(String callId, String sdp) async {
    calls.add(SfuCall('answer', {'sdp': sdp}));
    _maybeFail();
  }

  @override
  Future<SfuCloseResult> close(
    String callId, {
    List<String>? trackNames,
    List<String>? userIds,
    String? sdp,
  }) async {
    calls.add(SfuCall('close', {'tracks': trackNames, 'users': userIds}));
    _maybeFail();
    return const SfuCloseResult(closed: [], sdp: null);
  }

  @override
  Future<void> layer(
    String callId, {
    required String userId,
    required SfuRid rid,
  }) async {
    calls.add(SfuCall('layer', {'user': userId, 'rid': rid.name}));
    _maybeFail();
  }

  void _maybeFail() {
    final f = failNext;
    if (f != null) {
      failNext = null;
      if (f is ApiException) throw f;
      throw StateError('$f');
    }
  }
}

class FakeSfuPeer implements SfuPeer {
  FakeSfuPeer(this.onTrack, this.onState);

  final SfuTrackHandler onTrack;
  final void Function(CallMediaState) onState;
  final sends = <({String kind, bool simulcast})>[];
  final remotes = <String>[];
  final stopped = <String>[];
  final layers = <Set<String>>[];
  var restarts = 0;
  var serversSet = 0;
  var closed = false;
  var offers = 0;
  var answers = 0;
  var iceRestartOffers = 0;

  /// Tracks the SFU "sends" while the offer is applied (fired in setRemote).
  final List<({String mid, FakeTrack track})> incomingOnOffer = [];
  bool failRestart = false;
  final statsReports = <StatsReport>[];

  /// The mids of our sending sections, in the order they were added.
  final _sendMids = <String>[];
  var _next = 0;

  @override
  Future<void> addSend(
    MediaStreamTrack track,
    MediaStream stream, {
    bool simulcast = false,
  }) async {
    sends.add((kind: track.kind!, simulcast: simulcast));
    _sendMids.add('${_next++}:${track.kind}');
  }

  @override
  Future<String> createOffer({bool iceRestart = false}) async {
    offers++;
    if (iceRestart) iceRestartOffers++;
    final b = StringBuffer('v=0\r\n');
    for (final e in _sendMids) {
      final parts = e.split(':');
      final stop = stopped.contains(parts[0]);
      b.write('m=${parts[1]} 9 UDP/TLS/RTP/SAVPF 111\r\n'
          'a=mid:${parts[0]}\r\n'
          'a=${stop ? 'inactive' : 'sendonly'}\r\n');
    }
    return b.toString();
  }

  @override
  Future<void> setRemote(String type, String sdp) async {
    remotes.add('$type:$sdp');
    if (type == 'offer') {
      for (final t in incomingOnOffer) {
        onTrack(t.mid, t.track, FakeStream('s-${t.mid}', [t.track]));
      }
    }
  }

  @override
  Future<String> createAnswer() async {
    answers++;
    return 'my-answer';
  }

  @override
  Future<void> stopMid(String mid) async => stopped.add(mid);

  @override
  Future<void> restartIce() async {
    restarts++;
    if (failRestart) throw StateError('no');
  }

  @override
  Future<void> setServers(List<IceServer> servers) async => serversSet++;

  @override
  Future<void> setActiveLayers(Set<String> rids) async => layers.add(rids);

  @override
  Future<List<StatsReport>> getStats() async => statsReports;

  @override
  Future<void> close() async => closed = true;
}

class FakeSfuRtc implements SfuRtc {
  final peers = <FakeSfuPeer>[];
  final streams = <FakeStream>[];
  var speaker = <bool>[];
  var flips = 0;
  var openedVideo = <bool>[];

  FakeSfuPeer get peer => peers.last;

  @override
  Future<MediaStream> openUserMedia({required bool video}) async {
    openedVideo.add(video);
    final s = FakeStream('mic', [
      FakeTrack('audio', 'a1'),
      if (video) FakeTrack('video', 'v1'),
    ]);
    streams.add(s);
    return s;
  }

  @override
  Future<MediaStream> openCamera({bool front = true}) async {
    final s = FakeStream('cam', [FakeTrack('video', 'v2')]);
    streams.add(s);
    return s;
  }

  @override
  Future<SfuPeer> createPeer(
    List<IceServer> servers, {
    required SfuTrackHandler onTrack,
    required void Function(CallMediaState state) onState,
  }) async {
    final p = FakeSfuPeer(onTrack, onState);
    peers.add(p);
    return p;
  }

  @override
  Future<void> switchCamera(MediaStreamTrack track) async => flips++;

  @override
  Future<void> setSpeaker(bool on) async => speaker.add(on);
}
