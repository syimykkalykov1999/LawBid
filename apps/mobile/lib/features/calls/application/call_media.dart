import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/features/calls/domain/call_models.dart';

/// Where the audio link is (OQ-041).
enum CallMediaState { connecting, connected, failed }

/// The media side of a call: microphone (and camera in a video call),
/// peer connection, speaker. Kept behind an interface so the call logic is
/// tested without WebRTC.
abstract interface class CallMedia {
  /// Opens the mic (+ the front camera when [video]) and a peer
  /// connection; [onSignal] gets our ICE candidates to relay, [onState]
  /// the link state.
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
  });

  /// Owner 2026-10-05 (video calls): our camera picture; null in an audio
  /// call or with the camera off.
  ValueListenable<MediaStream?> get localVideo;

  /// The other side's picture once it arrives.
  ValueListenable<MediaStream?> get remoteVideo;

  // ignore: avoid_positional_boolean_parameters
  Future<void> setCameraOn(bool on);

  /// Front ↔ back camera.
  Future<void> switchCamera();

  /// Caller: the SDP offer to send.
  Future<Map<String, Object?>> createOffer();

  /// Callee: takes the offer, returns the answer to send.
  Future<Map<String, Object?>> answer(Map<String, Object?> offer);

  /// Caller: the callee's answer.
  Future<void> setAnswer(Map<String, Object?> answer);

  Future<void> addCandidate(Map<String, Object?> candidate);

  // ignore: avoid_positional_boolean_parameters
  void setMuted(bool muted);

  // ignore: avoid_positional_boolean_parameters
  Future<void> setSpeaker(bool on);

  Future<void> close();
}

/// flutter_webrtc: echo cancellation on; an audio call starts on the
/// earpiece, a video call on the speaker with the front camera (up to
/// 720p, 30 fps — enough for a face, light on mobile data).
class WebRtcCallMedia implements CallMedia {
  RTCPeerConnection? _pc;
  MediaStream? _mic;
  bool _video = false;
  final _pendingCandidates = <RTCIceCandidate>[];
  bool _remoteSet = false;
  final _local = ValueNotifier<MediaStream?>(null);
  final _remote = ValueNotifier<MediaStream?>(null);

  @override
  ValueListenable<MediaStream?> get localVideo => _local;

  @override
  ValueListenable<MediaStream?> get remoteVideo => _remote;

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
  }) async {
    _video = video;
    _mic = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': video
          ? {
              'facingMode': 'user',
              'width': {'ideal': 1280},
              'height': {'ideal': 720},
              'frameRate': {'ideal': 30},
            }
          : false,
    });
    if (video) _local.value = _mic;
    final pc = await createPeerConnection({
      'iceServers': [for (final s in iceServers) s.toJson()],
      'sdpSemantics': 'unified-plan',
    });
    _pc = pc;
    for (final track in _mic!.getTracks()) {
      await pc.addTrack(track, _mic!);
    }
    pc
      ..onTrack = (e) {
        if (e.track.kind == 'video' && e.streams.isNotEmpty) {
          _remote.value = e.streams.first;
        }
      }
      ..onIceCandidate = (c) {
        if (c.candidate == null) return;
        onSignal({
          'type': 'candidate',
          'candidate': c.candidate,
          'sdpMid': c.sdpMid,
          'sdpMLineIndex': c.sdpMLineIndex,
        });
      }
      ..onConnectionState = (s) {
        switch (s) {
          case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
            onState(CallMediaState.connected);
          case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
            onState(CallMediaState.failed);
          // ignore: no_default_cases
          default:
            break;
        }
      };
    await Helper.setSpeakerphoneOn(video);
    onState(CallMediaState.connecting);
  }

  @override
  Future<Map<String, Object?>> createOffer() async {
    final pc = _pc!;
    final offer = await pc.createOffer({
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': _video,
    });
    await pc.setLocalDescription(offer);
    return {'type': 'offer', 'sdp': offer.sdp};
  }

  @override
  Future<Map<String, Object?>> answer(Map<String, Object?> offer) async {
    final pc = _pc!;
    await pc.setRemoteDescription(
      RTCSessionDescription(offer['sdp'] as String?, 'offer'),
    );
    await _flushCandidates();
    final ans = await pc.createAnswer({
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': _video,
    });
    await pc.setLocalDescription(ans);
    return {'type': 'answer', 'sdp': ans.sdp};
  }

  @override
  Future<void> setAnswer(Map<String, Object?> answer) async {
    await _pc!.setRemoteDescription(
      RTCSessionDescription(answer['sdp'] as String?, 'answer'),
    );
    await _flushCandidates();
  }

  @override
  Future<void> addCandidate(Map<String, Object?> c) async {
    final candidate = RTCIceCandidate(
      c['candidate'] as String?,
      c['sdpMid'] as String?,
      (c['sdpMLineIndex'] as num?)?.toInt(),
    );
    // Candidates can arrive before the remote description.
    if (!_remoteSet) {
      _pendingCandidates.add(candidate);
      return;
    }
    await _pc?.addCandidate(candidate);
  }

  Future<void> _flushCandidates() async {
    _remoteSet = true;
    for (final c in _pendingCandidates) {
      await _pc?.addCandidate(c);
    }
    _pendingCandidates.clear();
  }

  @override
  void setMuted(bool muted) {
    for (final t in _mic?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
  }

  @override
  Future<void> setSpeaker(bool on) => Helper.setSpeakerphoneOn(on);

  @override
  Future<void> setCameraOn(bool on) async {
    for (final t in _mic?.getVideoTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = on;
    }
    _local.value = on ? _mic : null;
  }

  @override
  Future<void> switchCamera() async {
    final tracks = _mic?.getVideoTracks() ?? const <MediaStreamTrack>[];
    if (tracks.isNotEmpty) await Helper.switchCamera(tracks.first);
  }

  @override
  Future<void> close() async {
    for (final t in _mic?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    _local.value = null;
    _remote.value = null;
    await _mic?.dispose();
    await _pc?.close();
    _pc = null;
    _mic = null;
    _video = false;
    _pendingCandidates.clear();
    _remoteSet = false;
  }
}

/// A fresh media object per call.
final callMediaFactoryProvider =
    Provider<CallMedia Function()>((ref) => WebRtcCallMedia.new);
