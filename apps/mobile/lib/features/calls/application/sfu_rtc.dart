import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/sfu_sdp.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// Owner 2026-10-24 (Cloudflare SFU group calls): the thin layer between
/// CloudflareSfuCallMedia and flutter_webrtc. Kept behind two interfaces so
/// the SFU logic (publish, pull, layers, reconnect) is tested with a fake
/// PeerConnection and no native code.

/// A track that arrived on the SFU connection.
typedef SfuTrackHandler = void Function(
  String mid,
  MediaStreamTrack track,
  MediaStream stream,
);

/// The one PeerConnection of an SFU call.
abstract interface class SfuPeer {
  /// Adds a send-only transceiver for [track]; the camera goes out as three
  /// simulcast layers (f / h / q) when [simulcast] is on.
  Future<void> addSend(
    MediaStreamTrack track,
    MediaStream stream, {
    bool simulcast = false,
  });

  /// A new offer, already set as our local description; returns its SDP.
  Future<String> createOffer({bool iceRestart = false});

  /// The SFU's answer (or its offer, when it renegotiates).
  Future<void> setRemote(String type, String sdp);

  /// The answer to the SFU's offer, set as our local description.
  Future<String> createAnswer();

  /// Stops the transceiver with [mid] (we no longer send / receive on it).
  Future<void> stopMid(String mid);

  /// Marks the ICE session for a restart (new route, same session).
  Future<void> restartIce();

  /// Fresh STUN / TURN servers for the next route.
  Future<void> setServers(List<IceServer> servers);

  /// Which simulcast layers of our camera may send (the rest pause).
  Future<void> setActiveLayers(Set<String> rids);

  Future<List<StatsReport>> getStats();

  Future<void> close();
}

/// Everything platform-bound: capture, the connection, the speaker.
abstract interface class SfuRtc {
  /// The microphone (and the front camera when [video]).
  Future<MediaStream> openUserMedia({required bool video});

  /// Just a camera picture (a camera switched on mid-call).
  Future<MediaStream> openCamera({bool front = true});

  Future<SfuPeer> createPeer(
    List<IceServer> servers, {
    required SfuTrackHandler onTrack,
    required void Function(CallMediaState state) onState,
  });

  Future<void> switchCamera(MediaStreamTrack track);

  // ignore: avoid_positional_boolean_parameters
  Future<void> setSpeaker(bool on);
}

/// The three layers a camera is sent in (design doc §3.5): full, half and
/// quarter size.
List<RTCRtpEncoding> sfuSimulcastEncodings() => [
      RTCRtpEncoding(
        rid: 'f',
        maxBitrate: 1200000,
        maxFramerate: 30,
      ),
      RTCRtpEncoding(
        rid: 'h',
        maxBitrate: 500000,
        maxFramerate: 30,
        scaleResolutionDownBy: 2,
      ),
      RTCRtpEncoding(
        rid: 'q',
        maxBitrate: 150000,
        maxFramerate: 20,
        scaleResolutionDownBy: 4,
      ),
    ];

/// flutter_webrtc: echo cancellation on, the front camera up to 720p.
class WebRtcSfuRtc implements SfuRtc {
  WebRtcSfuRtc({this.simulcastSupported = true});

  /// A kill switch for the simulcast (one layer) if a device misbehaves.
  final bool simulcastSupported;

  static Map<String, Object?> _camera({bool front = true}) => {
        'facingMode': front ? 'user' : 'environment',
        'width': {'ideal': 1280},
        'height': {'ideal': 720},
        'frameRate': {'ideal': 30},
      };

  @override
  Future<MediaStream> openUserMedia({required bool video}) =>
      navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': video ? _camera() : false,
      });

  @override
  Future<MediaStream> openCamera({bool front = true}) => navigator.mediaDevices
      .getUserMedia({'audio': false, 'video': _camera(front: front)});

  @override
  Future<SfuPeer> createPeer(
    List<IceServer> servers, {
    required SfuTrackHandler onTrack,
    required void Function(CallMediaState state) onState,
  }) async {
    final pc = await createPeerConnection({
      'iceServers': [for (final s in servers) s.toJson()],
      'sdpSemantics': 'unified-plan',
      'iceCandidatePoolSize': 2,
      'bundlePolicy': 'max-bundle',
      'continualGatheringPolicy': 'gather_continually',
      'iceConnectionReceivingTimeout': 10000,
      'iceBackupCandidatePairPingInterval': 2000,
    });
    final peer = _WebRtcSfuPeer(pc, simulcast: simulcastSupported);
    pc
      ..onTrack = (e) {
        final tid = e.transceiver?.mid ?? '';
        final mid = tid.isNotEmpty ? tid : peer.midOfTrack(e.track.id) ?? '';
        unawaited(() async {
          // The SFU's tracks may come without a stream: give the picture one
          // of its own so a tile can show it.
          var stream = e.streams.isNotEmpty ? e.streams.first : null;
          if (stream == null) {
            stream = await createLocalMediaStream('sfu-${e.track.id}');
            await stream.addTrack(e.track);
          }
          if (kIsWeb && e.track.kind == 'audio') {
            await peer.playWebAudio(mid, stream);
          }
          onTrack(mid, e.track, stream);
        }());
      }
      ..onConnectionState = (s) {
        switch (s) {
          case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
            onState(CallMediaState.connected);
          case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
            onState(CallMediaState.disconnected);
          case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
            onState(CallMediaState.failed);
          // ignore: no_default_cases
          default:
            break;
        }
      };
    return peer;
  }

  @override
  Future<void> switchCamera(MediaStreamTrack track) async {
    if (kIsWeb) return;
    await Helper.switchCamera(track);
  }

  @override
  Future<void> setSpeaker(bool on) async {
    // Browsers pick the output device themselves.
    if (kIsWeb) return;
    await Helper.setSpeakerphoneOn(on);
  }
}

class _WebRtcSfuPeer implements SfuPeer {
  _WebRtcSfuPeer(this._pc, {required this.simulcast});

  final RTCPeerConnection _pc;
  final bool simulcast;
  Map<String, String> _remoteMids = const {};

  // Web: a browser plays the other side only through an <audio> element,
  // which a renderer creates; the phones play it by themselves.
  final _webAudio = <String, RTCVideoRenderer>{};

  Future<void> playWebAudio(String mid, MediaStream stream) async {
    final r = _webAudio[mid] ??= RTCVideoRenderer();
    await r.initialize();
    r.srcObject = stream;
  }

  /// The transceiver an incoming track belongs to, read from the SFU's
  /// offer when the platform's own `mid` is empty.
  String? midOfTrack(String? trackId) => _remoteMids[trackId];

  @override
  Future<void> addSend(
    MediaStreamTrack track,
    MediaStream stream, {
    bool simulcast = false,
  }) async {
    final wantLayers = simulcast && this.simulcast && track.kind == 'video';
    await _pc.addTransceiver(
      track: track,
      init: RTCRtpTransceiverInit(
        direction: TransceiverDirection.SendOnly,
        streams: [stream],
        sendEncodings: wantLayers ? sfuSimulcastEncodings() : null,
      ),
    );
  }

  @override
  Future<String> createOffer({bool iceRestart = false}) async {
    final offer = await _pc.createOffer({if (iceRestart) 'iceRestart': true});
    final sdp = tuneOpusSdp(offer.sdp ?? '');
    await _pc.setLocalDescription(RTCSessionDescription(sdp, 'offer'));
    return sdp;
  }

  @override
  Future<void> setRemote(String type, String sdp) async {
    if (type == 'offer') _remoteMids = midByTrackId(sdp);
    await _pc.setRemoteDescription(RTCSessionDescription(sdp, type));
  }

  @override
  Future<String> createAnswer() async {
    final ans = await _pc.createAnswer();
    final sdp = tuneOpusSdp(ans.sdp ?? '');
    await _pc.setLocalDescription(RTCSessionDescription(sdp, 'answer'));
    return sdp;
  }

  @override
  Future<void> stopMid(String mid) async {
    for (final t in await _pc.getTransceivers()) {
      if (t.mid == mid) {
        await t.stop();
        return;
      }
    }
  }

  @override
  Future<void> restartIce() => _pc.restartIce();

  @override
  Future<void> setServers(List<IceServer> servers) => _pc.setConfiguration({
        'iceServers': [for (final s in servers) s.toJson()],
        'sdpSemantics': 'unified-plan',
        'bundlePolicy': 'max-bundle',
        'continualGatheringPolicy': 'gather_continually',
      });

  @override
  Future<void> setActiveLayers(Set<String> rids) async {
    for (final s in await _pc.getSenders()) {
      if (s.track?.kind != 'video') continue;
      final p = s.parameters;
      final enc = p.encodings;
      if (enc == null || enc.length < 2) continue;
      for (final e in enc) {
        e.active = rids.contains(e.rid);
      }
      p
        ..encodings = enc
        ..degradationPreference = RTCDegradationPreference.MAINTAIN_FRAMERATE;
      await s.setParameters(p);
    }
  }

  @override
  Future<List<StatsReport>> getStats() => _pc.getStats();

  @override
  Future<void> close() async {
    for (final r in _webAudio.values) {
      r.srcObject = null;
      await r.dispose();
    }
    _webAudio.clear();
    await _pc.close();
  }
}

/// A fresh transport per call; tests swap it for a fake.
SfuRtc defaultSfuRtc() => WebRtcSfuRtc();

/// SDP media kinds.
const kSfuAudio = 'audio';
const kSfuVideo = 'video';

/// Reads the mids of our sending sections out of [offer]: the audio one
/// first, the video one second (the order we add them in).
({String? audio, String? video}) sendMidsOf(String offer) => (
      audio: sendOnlyMids(offer, kSfuAudio).firstOrNull,
      video: sendOnlyMids(offer, kSfuVideo).lastOrNull,
    );
