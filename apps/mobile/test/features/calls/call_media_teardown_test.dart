import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/livekit_rtc.dart';

/// R-037 (owner 2026-10-28: calls lag, the end freezes): the end of a call
/// in the LiveKit order (tracks stopped → callbacks cleared → senders
/// removed → close → dispose), one peer connection per person, and the
/// link numbers the next phone test reads.
class _Log {
  final steps = <String>[];
}

class _Track extends Fake implements MediaStreamTrack {
  _Track(this.log, this.kind);

  final _Log log;
  @override
  final String kind;
  @override
  bool enabled = true;

  @override
  String get id => 'track-$kind';

  @override
  Future<void> stop() async => log.steps.add('stop $kind');
}

class _Stream extends Fake implements MediaStream {
  _Stream(this.tracks);

  final List<MediaStreamTrack> tracks;
  void Function()? onDispose;

  @override
  List<MediaStreamTrack> getTracks() => tracks;
  @override
  List<MediaStreamTrack> getAudioTracks() =>
      tracks.where((t) => t.kind == 'audio').toList();
  @override
  List<MediaStreamTrack> getVideoTracks() =>
      tracks.where((t) => t.kind == 'video').toList();
  @override
  Future<void> dispose() async => onDispose?.call();
}

class _Sender extends Fake implements RTCRtpSender {}

class _Pc extends Fake implements RTCPeerConnection {
  _Pc(this.log, this.name);

  final _Log log;
  final String name;
  final sent = <RTCRtpSender>[];

  @override
  dynamic Function(RTCSignalingState state)? onSignalingState;
  @override
  dynamic Function(RTCPeerConnectionState state)? onConnectionState;
  @override
  dynamic Function(RTCIceGatheringState state)? onIceGatheringState;
  @override
  dynamic Function(RTCIceConnectionState state)? onIceConnectionState;
  @override
  dynamic Function(RTCIceCandidate candidate)? onIceCandidate;
  @override
  dynamic Function(MediaStream stream)? onAddStream;
  @override
  dynamic Function(MediaStream stream)? onRemoveStream;
  @override
  dynamic Function(MediaStream stream, MediaStreamTrack track)? onAddTrack;
  @override
  dynamic Function(MediaStream stream, MediaStreamTrack track)? onRemoveTrack;
  @override
  dynamic Function(RTCDataChannel channel)? onDataChannel;
  @override
  dynamic Function()? onRenegotiationNeeded;
  @override
  dynamic Function(RTCTrackEvent event)? onTrack;

  bool get callbacksCleared =>
      onTrack == null &&
      onIceCandidate == null &&
      onConnectionState == null &&
      onIceConnectionState == null &&
      onRenegotiationNeeded == null;

  @override
  Future<RTCRtpSender> addTrack(
    MediaStreamTrack track, [
    MediaStream? stream,
  ]) async {
    final s = _Sender();
    sent.add(s);
    return s;
  }

  @override
  Future<List<RTCRtpSender>> getSenders() async => [...sent];

  @override
  Future<bool> removeTrack(RTCRtpSender sender) async {
    log.steps.add('$name removeTrack');
    return sent.remove(sender);
  }

  @override
  Future<void> close() async {
    expect(callbacksCleared, isTrue, reason: 'a callback could still fire');
    log.steps.add('$name close');
  }

  @override
  Future<void> dispose() async => log.steps.add('$name dispose');
}

StatsReport _r(String id, String type, Map<String, Object?> v) =>
    StatsReport(id, type, 0, v);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('FlutterWebRTC.Method'),
          (_) async => null,
        );
  });

  group('disposePeerConnection (LiveKit Transport.onDispose)', () {
    test(
      'callbacks cleared, senders removed, then close, then dispose',
      () async {
        final log = _Log();
        final pc = _Pc(log, 'pc')
          ..onTrack = (_) {}
          ..onIceCandidate = (_) {}
          ..onConnectionState = (_) {}
          ..onIceConnectionState = (_) {}
          ..onRenegotiationNeeded = () {};
        await pc.addTrack(_Track(log, 'audio'));
        await disposePeerConnection(pc);
        expect(log.steps, ['pc removeTrack', 'pc close', 'pc dispose']);
        expect(pc.callbacksCleared, isTrue);
      },
    );
  });

  group('WebRtcCallMedia', () {
    late _Log log;
    late List<Completer<RTCPeerConnection>> pending;
    var made = 0;

    WebRtcCallMedia media({bool gate = false}) {
      log = _Log();
      pending = [];
      made = 0;
      return WebRtcCallMedia(
        getUserMedia: (_) async =>
            _Stream([_Track(log, 'audio'), _Track(log, 'video')]),
        createPc: (_) {
          final pc = _Pc(log, 'pc${made++}');
          if (!gate) return Future.value(pc);
          final c = Completer<RTCPeerConnection>();
          pending.add(c);
          return c.future.then((_) => pc);
        },
      );
    }

    test('the end: our tracks stop first, then each link goes the LiveKit '
        'way', () async {
      final m = media();
      await m.open(const [], onSignal: (_) {}, onState: (_) {}, peer: 'a');
      await m.addPeer('b', onSignal: (_) {}, onState: (_) {});
      await m.close();
      expect(log.steps, [
        'stop audio',
        'stop video',
        'pc0 removeTrack',
        'pc0 removeTrack',
        'pc0 close',
        'pc0 dispose',
        'pc1 removeTrack',
        'pc1 removeTrack',
        'pc1 close',
        'pc1 dispose',
      ]);
      // A second close does nothing.
      log.steps.clear();
      await m.close();
      expect(log.steps, isEmpty);
    });

    test('two set-ups of one link racing: one connection stays, the other '
        'is disposed (no hidden second stream)', () async {
      final m2 = media(gate: true);
      final opening = m2.open(
        const [],
        onSignal: (_) {},
        onState: (_) {},
        peer: 'a',
      );
      await Future<void>.delayed(Duration.zero);
      pending.single.complete(_Pc(log, 'unused'));
      await opening;
      final x = m2.addPeer('b', onSignal: (_) {}, onState: (_) {});
      final y = m2.addPeer('b', onSignal: (_) {}, onState: (_) {});
      for (final c in pending.skip(1)) {
        c.complete(_Pc(log, 'unused'));
      }
      await Future.wait([x, y]);
      expect(m2.peers, {'a', 'b'});
      expect(log.steps.where((s) => s.endsWith('dispose')), hasLength(1));
      await m2.close();
    });

    test('close during a pending getUserMedia releases the stream', () async {
      final log = _Log();
      final gate = Completer<MediaStream>();
      var disposed = false;
      var pcs = 0;
      final m = WebRtcCallMedia(
        getUserMedia: (_) => gate.future,
        createPc: (_) async => _Pc(log, 'pc${pcs++}'),
      );
      final opening = m.open(
        const [],
        onSignal: (_) {},
        onState: (_) {},
        peer: 'a',
      );
      await Future<void>.delayed(Duration.zero);
      await m.close();
      gate.complete(
        _Stream([_Track(log, 'audio'), _Track(log, 'video')])
          ..onDispose = () => disposed = true,
      );
      await opening;
      expect(log.steps, ['stop audio', 'stop video']);
      expect(disposed, isTrue);
      expect(m.peers, isEmpty);
      expect(pcs, 0);
    });

    test('a link set up after the end is torn down, not kept', () async {
      final m = media(gate: true);
      final opening = m.open(
        const [],
        onSignal: (_) {},
        onState: (_) {},
        peer: 'a',
      );
      await Future<void>.delayed(Duration.zero);
      await m.close();
      pending.single.complete(_Pc(log, 'unused'));
      await expectLater(opening, throwsStateError);
      expect(log.steps, contains('pc0 dispose'));
      expect(m.peers, isEmpty);
    });
  });

  group('link numbers for the phone test', () {
    test('rtt, jitter, loss, bandwidth and the candidate types', () {
      final s = linkStatsFrom([
        _r('p', 'candidate-pair', {
          'nominated': true,
          'currentRoundTripTime': 0.12,
          'availableOutgoingBitrate': 800000,
          'localCandidateId': 'l1',
          'remoteCandidateId': 'r1',
        }),
        _r('l1', 'local-candidate', {'candidateType': 'relay'}),
        _r('r1', 'remote-candidate', {'candidateType': 'srflx'}),
        _r('a', 'inbound-rtp', {'jitter': 0.03}),
        _r('v', 'inbound-rtp', {'jitter': '0.045'}),
        _r('x', 'remote-inbound-rtp', {'fractionLost': 0.05}),
      ])!;
      expect(s.rttMs, closeTo(120, 0.01));
      expect(s.jitterMs, closeTo(45, 0.01));
      expect(s.lossPct, closeTo(5, 0.01));
      expect(s.availableBps, 800000);
      expect(s.localCandidate, 'relay');
      expect(s.remoteCandidate, 'srflx');
    });

    test('one summary line per call; none when the link never came up', () {
      final log = CallStatsLog();
      expect(log.summary('p2p'), isNull);
      log
        ..add(
          const LinkStats(
            rttMs: 100,
            jitterMs: 10,
            lossPct: 1,
            availableBps: 900000,
            localCandidate: 'host',
            remoteCandidate: 'srflx',
          ),
        )
        ..add(
          const LinkStats(
            rttMs: 300,
            jitterMs: 40,
            lossPct: 7,
            availableBps: 300000,
            localCandidate: 'host',
            remoteCandidate: 'srflx',
          ),
        )
        ..add(const LinkStats(rttMs: 200, jitterMs: 20));
      expect(
        log.summary('p2p'),
        'callstats p2p n=3 rtt=200/300ms jitter=20/40ms loss<=7.0% '
        'bwmin=300kbps pair=host>srflx',
      );
    });
  });
}
