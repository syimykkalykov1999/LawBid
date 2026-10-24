import 'package:flutter/material.dart' show Size;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/cloudflare_sfu_call_media.dart';
import 'package:lawbid/features/calls/application/sfu_sdp.dart';
import 'package:lawbid/features/calls/data/calls_sfu_api.dart';

import 'sfu_fakes.dart';

/// Owner 2026-10-24: the Cloudflare SFU client — one PeerConnection,
/// publish, pull, layers, reconnect — against a fake API and a fake
/// PeerConnection layer.
class _Rig {
  _Rig({
    Duration iceRestartWindow = const Duration(milliseconds: 60),
    Duration cameraCloseAfter = const Duration(milliseconds: 40),
    Duration qualityEvery = const Duration(hours: 1),
    int maxRecreate = 2,
  }) {
    media = CloudflareSfuCallMedia(
      callId: 'c1',
      api: api,
      rtc: rtc,
      iceRestartWindow: iceRestartWindow,
      cameraCloseAfter: cameraCloseAfter,
      qualityEvery: qualityEvery,
      levelsEvery: const Duration(hours: 1),
      layerDebounce: const Duration(milliseconds: 10),
      retryPause: const Duration(milliseconds: 5),
      maxRecreate: maxRecreate,
    );
  }

  final api = FakeSfuApi();
  final rtc = FakeSfuRtc();
  late final CloudflareSfuCallMedia media;
  final states = <CallMediaState>[];

  Future<void> open({bool video = false}) => media.open(
        const [],
        onSignal: (_) {},
        onState: states.add,
        video: video,
      );

  /// What the peer connection reports.
  void peerSays(CallMediaState s) => rtc.peer.onState(s);
}

Future<void> _tick([int ms = 30]) =>
    Future<void>.delayed(Duration(milliseconds: ms));

void main() {
  test('open: a session, one connection, the mic published', () async {
    final r = _Rig();
    await r.open();
    expect(r.api.sessions, 1);
    expect(r.rtc.peers, hasLength(1));
    expect(r.rtc.peer.sends.map((s) => s.kind), ['audio']);
    final pub = r.api.named('publish').single;
    expect(pub.args['mids'], {'0': 'mic'});
    // The SFU's answer is applied.
    expect(r.rtc.peer.remotes.single, startsWith('answer:answer-of-'));
    expect(r.rtc.openedVideo, [false]);
    await r.media.close();
  });

  test('a video call publishes the mic and the camera as 3 simulcast layers',
      () async {
    final r = _Rig();
    await r.open(video: true);
    expect(r.rtc.peer.sends.map((s) => (s.kind, s.simulcast)), [
      ('audio', false),
      ('video', true),
    ]);
    expect(r.api.named('publish').single.args['mids'], {
      '0': 'mic',
      '1': 'cam',
    });
    expect(r.media.localVideo.value, isNotNull);
    await r.media.close();
  });

  test('the link state of the connection reaches the call', () async {
    final r = _Rig();
    await r.open();
    r
      ..peerSays(CallMediaState.connected)
      ..peerSays(CallMediaState.disconnected);
    expect(r.states, [
      CallMediaState.connecting,
      CallMediaState.connected,
      CallMediaState.disconnected,
    ]);
    await r.media.close();
  });

  group('pull', () {
    test(
        'a person who publishes is pulled; the offer is answered; mid maps '
        'to the person', () async {
      final r = _Rig();
      await r.open();
      r.rtc.peer.incomingOnOffer.addAll([
        (mid: 'r0', track: FakeTrack('video', 'tv')),
        (mid: 'r1', track: FakeTrack('audio', 'ta')),
      ]);
      await r.media.syncRoster({
        'u1': {'mic', 'cam'},
      });
      final sub = r.api.named('subscribe').single;
      expect(sub.args['users'], ['u1']);
      expect(sub.args['names'], ['cam', 'mic']);
      // Default layer of a camera is the half one.
      expect(sub.args['rid'], 'h');
      // The SFU's offer was applied, our answer went back.
      expect(r.rtc.peer.remotes.last, 'offer:sfu-offer');
      expect(r.api.named('answer').single.args['sdp'], 'my-answer');
      // The video track (mid r1) landed on u1's tile, the audio did not
      // become a picture.
      expect(r.media.remoteStreams.value.keys, ['u1']);
      expect(r.media.peers, {'u1'});
      await r.media.close();
    });

    test('someone joins later: only the newcomer is asked for', () async {
      final r = _Rig();
      await r.open();
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      await r.media.syncRoster({
        'u1': {'mic'},
        'u2': {'mic', 'cam'},
      });
      final subs = r.api.named('subscribe');
      expect(subs, hasLength(2));
      expect(subs.last.args['users'], ['u2']);
      await r.media.close();
    });

    test('people with the same wish go in one request', () async {
      final r = _Rig();
      await r.open();
      await r.media.syncRoster({
        'u1': {'mic'},
        'u2': {'mic'},
        'u3': {'mic', 'cam'},
      });
      final subs = r.api.named('subscribe');
      expect(subs, hasLength(2));
      expect(subs.first.args['users'], ['u1', 'u2']);
      await r.media.close();
    });

    test('a track that arrives before the answer of /subscribe is not lost',
        () async {
      final r = _Rig();
      await r.open();
      // The SFU's tracks come while its offer is applied; the mapping of mid
      // to person is recorded before that.
      r.rtc.peer.incomingOnOffer
          .add((mid: 'r0', track: FakeTrack('video', 'tv')));
      await r.media.syncRoster({
        'u9': {'cam'},
      });
      expect(r.media.remoteStreams.value.keys, ['u9']);
      await r.media.close();
    });

    test('an unknown roster (no sfuTracks) changes nothing', () async {
      final r = _Rig();
      await r.open();
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      await r.media.syncRoster({'u1': null});
      expect(r.api.named('subscribe'), hasLength(1));
      expect(r.api.named('close'), isEmpty);
      await r.media.close();
    });

    test('a person who left: the tracks are closed, the tile goes', () async {
      final r = _Rig();
      await r.open();
      r.rtc.peer.incomingOnOffer
          .add((mid: 'r0', track: FakeTrack('video', 'tv')));
      await r.media.syncRoster({
        'u1': {'mic', 'cam'},
      });
      expect(r.media.remoteStreams.value.keys, ['u1']);
      await r.media.syncRoster({});
      expect(r.media.remoteStreams.value, isEmpty);
      expect(r.media.peers, isEmpty);
      expect(r.rtc.peer.stopped, containsAll(['r0', 'r1']));
      final close = r.api.named('close').single;
      expect(close.args['users'], ['u1']);
      await r.media.close();
    });

    test('a camera that stopped: closed and the mic is pulled again', () async {
      final r = _Rig();
      await r.open();
      await r.media.syncRoster({
        'u1': {'mic', 'cam'},
      });
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      expect(r.api.named('close').single.args['users'], ['u1']);
      final subs = r.api.named('subscribe');
      expect(subs.last.args['names'], ['mic']);
      expect(r.media.peers, {'u1'});
      await r.media.close();
    });

    test('more than 64 tracks: asked again after the answer', () async {
      final r = _Rig();
      await r.open();
      r.api.batchLimitOnce = 1;
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      // The first round pulled u1; the limit note asks for another round,
      // which finds nothing more to ask for.
      expect(r.api.named('subscribe'), hasLength(1));
      await r.media.close();
    });

    test('a refused subscribe is tried again later', () async {
      final r = _Rig();
      await r.open();
      r.api.failNext = StateError('503');
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      expect(r.media.peers, isEmpty);
      await _tick(3300);
      expect(r.media.peers, {'u1'});
      await r.media.close();
    });
  });

  group('layers', () {
    test('the layer of a camera follows the wish; no repeat requests',
        () async {
      final r = _Rig();
      await r.open();
      await r.media.syncRoster({
        'u1': {'cam'},
        'u2': {'cam'},
      });
      r.media.setLayers({'u1': SfuRid.f, 'u2': SfuRid.q});
      await _tick();
      final layers = r.api.named('layer');
      expect(layers.map((c) => (c.args['user'], c.args['rid'])), [
        ('u1', 'f'),
        ('u2', 'q'),
      ]);
      // The same wish again: nothing is sent.
      r.media.setLayers({'u1': SfuRid.f, 'u2': SfuRid.q});
      await _tick();
      expect(r.api.named('layer'), hasLength(2));
      // The big tile shrinks.
      r.media.setLayers({'u1': SfuRid.q, 'u2': SfuRid.q});
      await _tick();
      expect(r.api.named('layer').last.args, {'user': 'u1', 'rid': 'q'});
      await r.media.close();
    });

    test('a person pulled after the wish is known gets that layer at once',
        () async {
      final r = _Rig();
      await r.open();
      r.media.setLayers({'u1': SfuRid.f});
      await r.media.syncRoster({
        'u1': {'cam'},
      });
      expect(r.api.named('subscribe').single.args['rid'], 'f');
      await _tick();
      expect(r.api.named('layer'), isEmpty);
      await r.media.close();
    });

    test('big tile = full, small = quarter', () {
      expect(sfuRidForTile(const Size(360, 560)), SfuRid.f);
      expect(sfuRidForTile(const Size(160, 160)), SfuRid.h);
      expect(sfuRidForTile(const Size(72, 96)), SfuRid.q);
      expect(
        sfuRidForTile(
            nominalTileSize(total: 9, focused: false, anyFocus: false),),
        SfuRid.q,
      );
      expect(
        sfuRidForTile(
            nominalTileSize(total: 4, focused: false, anyFocus: false),),
        SfuRid.h,
      );
      expect(
        sfuRidForTile(nominalTileSize(total: 4, focused: true, anyFocus: true)),
        SfuRid.f,
      );
    });

    test('our own layers thin out as the link weakens', () {
      expect(sfuLayersFor(LinkQuality.good), {'f', 'h', 'q'});
      expect(sfuLayersFor(LinkQuality.fair), {'h', 'q'});
      expect(sfuLayersFor(LinkQuality.poor), {'q'});
      expect(sfuLayersFor(LinkQuality.bad), isEmpty);
    });
  });

  group('camera', () {
    test('off for long: unpublished; on again: published anew', () async {
      final r = _Rig();
      await r.open(video: true);
      await r.media.setCameraOn(false);
      expect(r.media.localVideo.value, isNull);
      await _tick(120);
      final close = r.api.named('close').single;
      expect(close.args['tracks'], ['cam']);
      expect(r.rtc.peer.stopped, ['1']);
      await r.media.setCameraOn(true);
      final pubs = r.api.named('publish');
      expect(pubs, hasLength(2));
      expect(pubs.last.args['mids'], {'2': 'cam'});
      await r.media.close();
    });

    test('off for a moment only: not unpublished', () async {
      final r = _Rig(cameraCloseAfter: const Duration(seconds: 5));
      await r.open(video: true);
      await r.media.setCameraOn(false);
      await r.media.setCameraOn(true);
      await _tick();
      expect(r.api.named('close'), isEmpty);
      await r.media.close();
    });

    test('a voice call turns the camera on: opened and published', () async {
      final r = _Rig();
      await r.open();
      await r.media.enableVideo();
      expect(r.api.named('publish').last.args['mids'], {'1': 'cam'});
      expect(r.media.localVideo.value, isNotNull);
      await r.media.disableVideo();
      expect(r.api.named('close').last.args['tracks'], ['cam']);
      expect(r.media.localVideo.value, isNull);
      await r.media.close();
    });

    test('mute switches the mic track; flip is local', () async {
      final r = _Rig();
      await r.open(video: true);
      r.media.setMuted(true);
      final mic = r.rtc.streams.first.getAudioTracks().single;
      expect(mic.enabled, isFalse);
      r.media.setMuted(false);
      expect(mic.enabled, isTrue);
      await r.media.switchCamera();
      expect(r.rtc.flips, 1);
      await r.media.close();
    });
  });

  group('reconnect', () {
    test('a short drop: ICE restart on the same connection, no new session',
        () async {
      final r = _Rig();
      await r.open();
      r.peerSays(CallMediaState.disconnected);
      final done = r.media.reconnect();
      await _tick(10);
      r.peerSays(CallMediaState.connected);
      await done;
      expect(r.rtc.peer.restarts, 1);
      expect(r.rtc.peers, hasLength(1));
      expect(r.api.sessions, 1);
      await r.media.close();
    });

    test('no recovery: a new session, published and pulled again', () async {
      final r = _Rig();
      await r.open(video: true);
      await r.media.syncRoster({
        'u1': {'mic', 'cam'},
      });
      final first = r.rtc.peer;
      r.peerSays(CallMediaState.disconnected);
      await r.media.reconnect();
      expect(first.closed, isTrue);
      expect(r.api.sessions, 2);
      expect(r.rtc.peers, hasLength(2));
      expect(r.api.named('publish'), hasLength(2));
      // Mic and camera went out again on the new connection.
      expect(r.rtc.peer.sends.map((s) => s.kind), ['audio', 'video']);
      // Everybody is pulled again.
      expect(r.api.named('subscribe'), hasLength(2));
      expect(r.media.peers, {'u1'});
      await r.media.close();
    });

    test('a dead connection goes straight to a new session', () async {
      final r = _Rig();
      await r.open();
      r.peerSays(CallMediaState.failed);
      await r.media.reconnect();
      expect(r.rtc.peer.restarts, 0);
      expect(r.api.sessions, 2);
      await r.media.close();
    });

    test('down longer than the session window: a new session', () async {
      var now = DateTime(2026, 10, 24, 12);
      final api = FakeSfuApi();
      final rtc = FakeSfuRtc();
      final media = CloudflareSfuCallMedia(
        callId: 'c1',
        api: api,
        rtc: rtc,
        clock: () => now,
        qualityEvery: const Duration(hours: 1),
        levelsEvery: const Duration(hours: 1),
        retryPause: const Duration(milliseconds: 5),
      );
      await media.open(const [], onSignal: (_) {}, onState: (_) {});
      rtc.peer.onState(CallMediaState.disconnected);
      now = now.add(const Duration(seconds: 45));
      await media.reconnect();
      expect(rtc.peer.restarts, 0);
      expect(api.sessions, 2);
      await media.close();
    });

    test('calls while one is running share it', () async {
      final r = _Rig();
      await r.open();
      r.peerSays(CallMediaState.disconnected);
      final a = r.media.reconnect();
      final b = r.media.reconnect();
      expect(identical(a, b), isTrue);
      r.peerSays(CallMediaState.connected);
      await a;
      await r.media.close();
    });

    test('the new session cannot be made: failed is reported', () async {
      final r = _Rig();
      await r.open();
      r.peerSays(CallMediaState.failed);
      r.api.failPublish = 2;
      await r.media.reconnect();
      expect(r.states.last, CallMediaState.failed);
      await r.media.close();
    });
  });

  group('leave', () {
    test('the tracks are closed, the connection and the mic released',
        () async {
      final r = _Rig();
      await r.open(video: true);
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      await r.media.close();
      final close = r.api.named('close').last;
      expect(close.args['tracks'], containsAll(['mic', 'cam']));
      expect(r.rtc.peer.closed, isTrue);
      final stream = r.rtc.streams.first;
      expect(stream.disposed, isTrue);
      expect(
        stream.getTracks().cast<FakeTrack>().every((t) => t.stopped),
        isTrue,
      );
      expect(r.media.remoteStreams.value, isEmpty);
    });

    test('after close nothing more is sent', () async {
      final r = _Rig();
      await r.open();
      await r.media.close();
      final n = r.api.calls.length;
      await r.media.syncRoster({
        'u1': {'mic'},
      });
      await r.media.reconnect();
      r.media.setLayers({'u1': SfuRid.f});
      await _tick();
      expect(r.api.calls.length, n);
    });
  });

  group('sdp', () {
    const sdp = 'v=0\r\n'
        'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
        'a=mid:0\r\na=sendonly\r\na=msid:s1 trackA\r\n'
        'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'
        'a=mid:1\r\na=sendonly\r\na=msid:s1 trackV\r\n'
        'm=video 0 UDP/TLS/RTP/SAVPF 96\r\n'
        'a=mid:2\r\na=inactive\r\n'
        'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'
        'a=mid:3\r\na=sendonly\r\n';

    test('sections, send-only mids, msid map', () {
      expect(sdpSections(sdp), hasLength(4));
      expect(sendOnlyMids(sdp, 'video'), ['1', '3']);
      expect(midByTrackId(sdp), {'trackA': '0', 'trackV': '1'});
    });
  });
}
