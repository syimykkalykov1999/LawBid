import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/features/calls/domain/call_models.dart';

/// Where the audio link is (OQ-041).
enum CallMediaState { connecting, connected, failed }

/// The audio side of a call: microphone, peer connection, speaker. Kept
/// behind an interface so the call logic is tested without WebRTC.
abstract interface class CallMedia {
  /// Opens the mic and a peer connection; [onSignal] gets our ICE
  /// candidates to relay, [onState] the link state.
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  });

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

/// flutter_webrtc: audio only, echo cancellation on, earpiece by default.
class WebRtcCallMedia implements CallMedia {
  RTCPeerConnection? _pc;
  MediaStream? _mic;
  final _pendingCandidates = <RTCIceCandidate>[];
  bool _remoteSet = false;

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async {
    _mic = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': false,
    });
    final pc = await createPeerConnection({
      'iceServers': [for (final s in iceServers) s.toJson()],
      'sdpSemantics': 'unified-plan',
    });
    _pc = pc;
    for (final track in _mic!.getAudioTracks()) {
      await pc.addTrack(track, _mic!);
    }
    pc
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
    await Helper.setSpeakerphoneOn(false);
    onState(CallMediaState.connecting);
  }

  @override
  Future<Map<String, Object?>> createOffer() async {
    final pc = _pc!;
    final offer = await pc.createOffer({'offerToReceiveAudio': true});
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
    final ans = await pc.createAnswer({'offerToReceiveAudio': true});
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
  Future<void> close() async {
    for (final t in _mic?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _mic?.dispose();
    await _pc?.close();
    _pc = null;
    _mic = null;
    _pendingCandidates.clear();
    _remoteSet = false;
  }
}

/// A fresh media object per call.
final callMediaFactoryProvider =
    Provider<CallMedia Function()>((ref) => WebRtcCallMedia.new);
