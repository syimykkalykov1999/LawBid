import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lawbid/core/permissions/permission_primer.dart';

import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:record/record.dart' show AudioRecorder;

/// Where the audio link is (OQ-041).
enum CallMediaState {
  connecting,
  connected,

  /// Owner 2026-10-20: the network dropped — it may come back by itself or
  /// through an ICE restart (Wi-Fi ↔ 4G).
  disconnected,
  failed,
}

/// The media side of a call: microphone (and camera in a video call),
/// peer connections, speaker. Kept behind an interface so the call logic is
/// tested without WebRTC.
///
/// A two-person call has one link (to the first peer); a group call (owner
/// 2026-10-20) adds one link per other member, all sharing the same
/// microphone/camera — a mesh. The single-link methods address the first
/// link; the `…For` methods address any member by user id.
abstract interface class CallMedia {
  /// Opens the mic (+ the front camera when [video]) and the first peer
  /// connection (to [peer]); [onSignal] gets our ICE candidates to relay,
  /// [onState] the link state.
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
    String peer = '',
  });

  /// Owner 2026-10-05 (video calls): our camera picture; null in an audio
  /// call or with the camera off.
  ValueListenable<MediaStream?> get localVideo;

  /// The other side's picture once it arrives (the first link).
  ValueListenable<MediaStream?> get remoteVideo;

  /// Group calls: each member's picture by user id.
  ValueListenable<Map<String, MediaStream>> get remoteStreams;

  /// Group calls: who is speaking now (user ids; [kSelfSpeaker] = us).
  ValueListenable<Set<String>> get speaking;

  // ignore: avoid_positional_boolean_parameters
  Future<void> setCameraOn(bool on);

  /// Front ↔ back camera.
  Future<void> switchCamera();

  /// Owner 2026-10-22 (WhatsApp: the camera button of a voice call): opens
  /// the front camera mid-call and hands it to every link — a link that
  /// already had a picture gets the new one in its place, the others get a
  /// new video track. The caller then renegotiates each link (a new offer)
  /// so the other side starts receiving it.
  Future<void> enableVideo();

  /// The camera goes off for real (its light too): the track stops, every
  /// link keeps its video slot empty, so turning it on again needs no new
  /// slot.
  Future<void> disableVideo();

  /// Glare (perfect negotiation): our own offer to [peer] is still waiting
  /// for its answer.
  Future<bool> offerPendingFor(String peer);

  /// Glare, the polite side: our waiting offer to [peer] is taken back so
  /// theirs can be answered; ours is sent again afterwards.
  Future<void> rollbackFor(String peer);

  /// Caller: the SDP offer to send.
  Future<Map<String, Object?>> createOffer();

  /// Callee: takes the offer, returns the answer to send.
  Future<Map<String, Object?>> answer(Map<String, Object?> offer);

  /// Caller: the callee's answer.
  Future<void> setAnswer(Map<String, Object?> answer);

  Future<void> addCandidate(Map<String, Object?> candidate);

  /// Caller, after the network changed: a new offer that gathers fresh
  /// candidates; the callee answers it like the first one.
  Future<Map<String, Object?>> restartIce();

  /// Owner 2026-10-21: the worst link right now. Video is thinned or paused
  /// by itself as it drops; the call screen may say so.
  ValueListenable<LinkQuality> get quality;

  /// A fresh TURN login (the old one runs out in hours): taken by every
  /// link for its next ICE restart / relay refresh.
  Future<void> updateIceServers(List<IceServer> iceServers);

  // --- Group calls: one link per member ------------------------------------

  /// Members we have a link with (user ids).
  Set<String> get peers;

  /// A link to [peer] (no offer yet); its candidates go to [onSignal], its
  /// state to [onState].
  Future<void> addPeer(
    String peer, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  });

  Future<Map<String, Object?>> createOfferFor(String peer);
  Future<Map<String, Object?>> answerFor(
    String peer,
    Map<String, Object?> offer,
  );
  Future<void> setAnswerFor(String peer, Map<String, Object?> answer);
  Future<void> addCandidateFor(String peer, Map<String, Object?> candidate);
  Future<Map<String, Object?>> restartIceFor(String peer);

  /// Closes the link with [peer] (they left or were removed).
  Future<void> removePeer(String peer);

  // ignore: avoid_positional_boolean_parameters
  void setMuted(bool muted);

  // ignore: avoid_positional_boolean_parameters
  Future<void> setSpeaker(bool on);

  Future<void> close();
}

/// [CallMedia.speaking] key for our own microphone.
const kSelfSpeaker = 'me';

/// One WebRTC link of a call.
class _Link {
  _Link(this.peer, this.pc);

  final String peer;
  final RTCPeerConnection pc;
  final pending = <RTCIceCandidate>[];
  bool remoteSet = false;
  final tracker = QualityTracker();
  VideoTier? tier;

  /// Owner 2026-10-22: the slot our camera goes out through (kept when the
  /// camera is off, refilled when it comes back on).
  RTCRtpSender? videoSender;

  /// Our offer is out and its answer not yet in (glare check). Kept here,
  /// not read from the plugin: its signalling state arrives by an event,
  /// a beat after the call that changed it.
  bool offering = false;
}

/// A reading of one link from `getStats` (W3C names): the nominated
/// candidate pair gives the round trip and the bandwidth estimate, the
/// remote-inbound report the loss the other side saw. Null before a pair
/// exists.
LinkStats? linkStatsFrom(Iterable<StatsReport> reports) {
  double? rtt;
  var bps = 0.0;
  var loss = 0.0;
  var pair = false;
  double toD(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
  for (final r in reports) {
    final v = r.values;
    if (r.type == 'candidate-pair' &&
        (v['nominated'] == true || '${v['state']}' == 'succeeded')) {
      pair = true;
      final t = toD(v['currentRoundTripTime']);
      if (t > 0) rtt = t * 1000;
      final a = toD(v['availableOutgoingBitrate']);
      if (a > 0) bps = a;
    } else if (r.type == 'remote-inbound-rtp') {
      final l = toD(v['fractionLost']) * 100;
      if (l > loss) loss = l;
      final t = toD(v['roundTripTime']);
      if (rtt == null && t > 0) rtt = t * 1000;
    }
  }
  if (!pair && rtt == null) return null;
  return LinkStats(rttMs: rtt ?? 0, lossPct: loss, availableBps: bps);
}

/// flutter_webrtc: echo cancellation on; an audio call starts on the
/// earpiece, a video call on the speaker with the front camera (up to
/// 720p, 30 fps — enough for a face, light on mobile data).
class WebRtcCallMedia implements CallMedia {
  final _links = <String, _Link>{};
  String _first = '';
  List<IceServer> _servers = const [];
  MediaStream? _mic;
  bool _video = false;
  final _local = ValueNotifier<MediaStream?>(null);
  final _remote = ValueNotifier<MediaStream?>(null);
  final _remotes = ValueNotifier<Map<String, MediaStream>>(const {});
  final _speaking = ValueNotifier<Set<String>>(const {});
  Timer? _levelTimer;
  // Web: a browser plays the other side only through an <audio> element,
  // which a renderer creates; the phones play it by themselves.
  final _webAudio = <String, RTCVideoRenderer>{};
  bool _frontCamera = true;

  _Link get _firstLink => _links[_first]!;

  @override
  ValueListenable<MediaStream?> get localVideo => _local;

  @override
  ValueListenable<MediaStream?> get remoteVideo => _remote;

  @override
  ValueListenable<Map<String, MediaStream>> get remoteStreams => _remotes;

  @override
  ValueListenable<Set<String>> get speaking => _speaking;

  @override
  Set<String> get peers => _links.keys.toSet();

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
    String peer = '',
  }) async {
    _video = video;
    _servers = iceServers;
    _first = peer;
    _mic = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation': true,
        'noiseSuppression': true,
        'autoGainControl': true,
      },
      'video': video ? _cameraConstraints() : false,
    });
    if (video) _local.value = _mic;
    await _newLink(peer, onSignal: onSignal, onState: onState);
    await setSpeaker(video);
    onState(CallMediaState.connecting);
  }

  Future<_Link> _newLink(
    String peer, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async {
    final pc = await createPeerConnection(_config());
    final link = _Link(peer, pc);
    _links[peer] = link;
    for (final track in _mic!.getTracks()) {
      final sender = await pc.addTrack(track, _mic!);
      if (track.kind == 'video') link.videoSender = sender;
    }
    pc
      ..onTrack = (e) {
        if (e.track.kind == 'video' && e.streams.isNotEmpty) {
          final stream = e.streams.first;
          if (peer == _first) {
            // Owner 2026-10-22: a picture added mid-call may come in the
            // stream object the voice already arrived in — the screen must
            // still hear that it now has video.
            if (identical(_remote.value, stream)) _remote.value = null;
            _remote.value = stream;
          }
          _remotes.value = {..._remotes.value, peer: stream};
        }
        if (kIsWeb && e.track.kind == 'audio' && e.streams.isNotEmpty) {
          unawaited(_playWebAudio(peer, e.streams.first));
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
          case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
            onState(CallMediaState.disconnected);
          case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
            onState(CallMediaState.failed);
          // ignore: no_default_cases
          default:
            break;
        }
      };
    _watchLevels();
    _watchQuality();
    return link;
  }

  // --- Link quality: thin the picture, keep the voice ----------------------

  final _quality = ValueNotifier<LinkQuality>(LinkQuality.good);
  Timer? _qualityTimer;

  @override
  ValueListenable<LinkQuality> get quality => _quality;

  void _watchQuality() {
    _qualityTimer ??= Timer.periodic(
      const Duration(seconds: 3),
      (_) => unawaited(_pollQuality()),
    );
  }

  Future<void> _pollQuality() async {
    var worst = LinkQuality.good;
    final links = _links.values.toList();
    for (final link in links) {
      try {
        final stats = linkStatsFrom(await link.pc.getStats());
        if (stats == null) continue;
        final q = link.tracker.add(stats);
        if (q.index > worst.index) worst = q;
        if (_video) {
          await _applyTier(link, videoTierFor(q, links: links.length));
        }
      } on Object {
        // The link is closing.
      }
    }
    if (_quality.value != worst) _quality.value = worst;
  }

  Future<void> _applyTier(_Link link, VideoTier t) async {
    final old = link.tier;
    if (old != null &&
        old.active == t.active &&
        old.maxBitrate == t.maxBitrate &&
        old.scaleDown == t.scaleDown) {
      return;
    }
    for (final sender in await link.pc.getSenders()) {
      if (sender.track?.kind != 'video') continue;
      final p = sender.parameters;
      final enc = (p.encodings?.isNotEmpty ?? false)
          ? p.encodings!
          : [RTCRtpEncoding()];
      for (final e in enc) {
        e
          ..active = t.active
          ..maxBitrate = t.maxBitrate
          ..scaleResolutionDownBy = t.scaleDown
          ..maxFramerate = t.maxFps;
      }
      p
        ..encodings = enc
        // A weak link keeps the picture moving and gets blurrier, not choppy.
        ..degradationPreference = RTCDegradationPreference.MAINTAIN_FRAMERATE;
      await sender.setParameters(p);
    }
    link.tier = t;
  }

  @override
  Future<void> updateIceServers(List<IceServer> iceServers) async {
    _servers = iceServers;
    for (final link in _links.values.toList()) {
      try {
        await link.pc.setConfiguration(_config());
      } on Object {
        // The link is closing.
      }
    }
  }

  Map<String, dynamic> _config() => {
        'iceServers': [for (final s in _servers) s.toJson()],
        'sdpSemantics': 'unified-plan',
        'iceCandidatePoolSize': 2,
        'bundlePolicy': 'max-bundle',
        'continualGatheringPolicy': 'gather_continually',
        'iceConnectionReceivingTimeout': 10000,
        'iceBackupCandidatePairPingInterval': 2000,
      };

  Future<void> _playWebAudio(String peer, MediaStream stream) async {
    final r = _webAudio[peer] ??= RTCVideoRenderer();
    await r.initialize();
    r.srcObject = stream;
  }

  /// Group calls: who is talking — the audio levels of the incoming
  /// streams (and ours) every half second; only while there are 2+ links.
  void _watchLevels() {
    if (_links.length < 2) return;
    _levelTimer ??= Timer.periodic(
      const Duration(milliseconds: 500),
      (_) => unawaited(_pollLevels()),
    );
  }

  Future<void> _pollLevels() async {
    final now = <String>{};
    var self = 0.0;
    for (final link in _links.values.toList()) {
      try {
        for (final r in await link.pc.getStats()) {
          final level = (r.values['audioLevel'] as num?)?.toDouble() ?? 0;
          if (r.type == 'inbound-rtp' && level > 0.02) now.add(link.peer);
          if (r.type == 'media-source' && level > self) self = level;
        }
      } on Object {
        // The link is closing.
      }
    }
    if (self > 0.02 && !_mutedNow) now.add(kSelfSpeaker);
    final old = _speaking.value;
    if (old.length != now.length || !old.containsAll(now)) {
      _speaking.value = now;
    }
  }

  bool _mutedNow = false;

  _Link _linkOf(String? peer) {
    final l = _links[peer ?? _first];
    if (l == null) throw StateError('no link with $peer');
    return l;
  }

  Future<Map<String, Object?>> _offer(
    _Link link, {
    bool restart = false,
  }) async {
    // Owner 2026-10-22: every offer / answer leaves room for a picture, so
    // either side can switch its camera on mid-call (WhatsApp) — an audio
    // call simply sends nothing through it.
    final offer = await link.pc.createOffer({
      if (restart) 'iceRestart': true,
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': true,
    });
    final sdp = tuneOpusSdp(offer.sdp ?? '');
    await link.pc.setLocalDescription(RTCSessionDescription(sdp, 'offer'));
    link.offering = true;
    return {'type': 'offer', 'sdp': sdp};
  }

  Future<Map<String, Object?>> _answer(
    _Link link,
    Map<String, Object?> offer,
  ) async {
    await link.pc.setRemoteDescription(
      RTCSessionDescription(offer['sdp'] as String?, 'offer'),
    );
    await _flush(link);
    final ans = await link.pc.createAnswer({
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': true,
    });
    final sdp = tuneOpusSdp(ans.sdp ?? '');
    await link.pc.setLocalDescription(RTCSessionDescription(sdp, 'answer'));
    link.offering = false;
    return {'type': 'answer', 'sdp': sdp};
  }

  Future<void> _setAnswer(_Link link, Map<String, Object?> answer) async {
    // Owner 2026-10-22: an answer to an offer we took back (glare) or a
    // repeat of one already taken is dropped, not treated as a dead link.
    if (!link.offering) return;
    await link.pc.setRemoteDescription(
      RTCSessionDescription(answer['sdp'] as String?, 'answer'),
    );
    link.offering = false;
    await _flush(link);
  }

  Future<void> _candidate(_Link link, Map<String, Object?> c) async {
    final candidate = RTCIceCandidate(
      c['candidate'] as String?,
      c['sdpMid'] as String?,
      (c['sdpMLineIndex'] as num?)?.toInt(),
    );
    // Candidates can arrive before the remote description.
    if (!link.remoteSet) {
      link.pending.add(candidate);
      return;
    }
    await link.pc.addCandidate(candidate);
  }

  Future<void> _flush(_Link link) async {
    link.remoteSet = true;
    for (final c in link.pending) {
      await link.pc.addCandidate(c);
    }
    link.pending.clear();
  }

  @override
  Future<Map<String, Object?>> createOffer() => _offer(_firstLink);

  @override
  Future<Map<String, Object?>> restartIce() =>
      _offer(_firstLink, restart: true);

  @override
  Future<Map<String, Object?>> answer(Map<String, Object?> offer) =>
      _answer(_firstLink, offer);

  @override
  Future<void> setAnswer(Map<String, Object?> answer) =>
      _setAnswer(_firstLink, answer);

  @override
  Future<void> addCandidate(Map<String, Object?> c) =>
      _candidate(_firstLink, c);

  @override
  Future<void> addPeer(
    String peer, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async {
    if (_links.containsKey(peer)) return;
    await _newLink(peer, onSignal: onSignal, onState: onState);
    onState(CallMediaState.connecting);
  }

  @override
  Future<Map<String, Object?>> createOfferFor(String peer) =>
      _offer(_linkOf(peer));

  @override
  Future<Map<String, Object?>> restartIceFor(String peer) =>
      _offer(_linkOf(peer), restart: true);

  @override
  Future<Map<String, Object?>> answerFor(
    String peer,
    Map<String, Object?> offer,
  ) =>
      _answer(_linkOf(peer), offer);

  @override
  Future<void> setAnswerFor(String peer, Map<String, Object?> answer) =>
      _setAnswer(_linkOf(peer), answer);

  @override
  Future<void> addCandidateFor(String peer, Map<String, Object?> c) =>
      _candidate(_linkOf(peer), c);

  @override
  Future<void> removePeer(String peer) async {
    final link = _links.remove(peer);
    if (link == null) return;
    await link.pc.close();
    final r = _webAudio.remove(peer);
    if (r != null) {
      r.srcObject = null;
      await r.dispose();
    }
    _remotes.value = {..._remotes.value}..remove(peer);
    if (peer == _first) _remote.value = null;
    if (_links.length < 2) {
      _levelTimer?.cancel();
      _levelTimer = null;
      _speaking.value = const {};
    }
  }

  @override
  void setMuted(bool muted) {
    _mutedNow = muted;
    for (final t in _mic?.getAudioTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
  }

  @override
  Future<void> setSpeaker(bool on) async {
    // Browsers pick the output device themselves.
    if (kIsWeb) return;
    await Helper.setSpeakerphoneOn(on);
  }

  @override
  Future<void> setCameraOn(bool on) async {
    for (final t in _mic?.getVideoTracks() ?? const <MediaStreamTrack>[]) {
      t.enabled = on;
    }
    _local.value = on ? _mic : null;
  }

  @override
  Future<bool> offerPendingFor(String peer) async =>
      _links[peer]?.offering ?? false;

  @override
  Future<void> rollbackFor(String peer) async {
    final link = _links[peer];
    if (link == null || !link.offering) return;
    await link.pc.setLocalDescription(RTCSessionDescription('', 'rollback'));
    link.offering = false;
  }

  static Map<String, Object?> _cameraConstraints({bool front = true}) => {
        'facingMode': front ? 'user' : 'environment',
        'width': {'ideal': 1280},
        'height': {'ideal': 720},
        'frameRate': {'ideal': 30},
      };

  @override
  Future<void> enableVideo() async {
    final mic = _mic;
    if (mic == null) return;
    final live = mic.getVideoTracks();
    if (live.isNotEmpty) {
      // Still here (a video call's camera that was only paused).
      for (final t in live) {
        t.enabled = true;
      }
      _video = true;
      _local
        ..value = null
        ..value = mic;
      return;
    }
    _frontCamera = true;
    final cam = await navigator.mediaDevices.getUserMedia({
      'audio': false,
      'video': _cameraConstraints(),
    });
    final track = cam.getVideoTracks().first;
    await mic.addTrack(track);
    for (final link in _links.values.toList()) {
      final sender = link.videoSender;
      if (sender != null) {
        await sender.replaceTrack(track);
      } else {
        link.videoSender = await link.pc.addTrack(track, mic);
      }
    }
    _video = true;
    _local
      ..value = null
      ..value = mic;
  }

  @override
  Future<void> disableVideo() async {
    final mic = _mic;
    if (mic == null) return;
    for (final link in _links.values.toList()) {
      try {
        await link.videoSender?.replaceTrack(null);
      } on Object {
        // The link is closing.
      }
    }
    for (final t in mic.getVideoTracks()) {
      await t.stop();
      await mic.removeTrack(t);
    }
    _video = false;
    _local.value = null;
  }

  @override
  Future<void> switchCamera() async {
    final tracks = _mic?.getVideoTracks() ?? const <MediaStreamTrack>[];
    if (tracks.isEmpty) return;
    if (kIsWeb) return _switchCameraWeb(tracks.first);
    await Helper.switchCamera(tracks.first);
  }

  /// Browsers have no camera flip: open the other camera (where there is
  /// one) and hand its track to every peer in place of the old one.
  Future<void> _switchCameraWeb(MediaStreamTrack old) async {
    final mic = _mic;
    if (mic == null || _links.isEmpty) return;
    _frontCamera = !_frontCamera;
    final cam = await navigator.mediaDevices.getUserMedia({
      'audio': false,
      'video': _cameraConstraints(front: _frontCamera),
    });
    final track = cam.getVideoTracks().first;
    for (final link in _links.values) {
      await link.videoSender?.replaceTrack(track);
    }
    await old.stop();
    await mic.removeTrack(old);
    await mic.addTrack(track);
    // The preview re-reads the stream.
    _local
      ..value = null
      ..value = mic;
  }

  @override
  Future<void> close() async {
    _levelTimer?.cancel();
    _levelTimer = null;
    _qualityTimer?.cancel();
    _qualityTimer = null;
    _quality.value = LinkQuality.good;
    for (final t in _mic?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    _local.value = null;
    _remote.value = null;
    _remotes.value = const {};
    _speaking.value = const {};
    for (final r in _webAudio.values) {
      r.srcObject = null;
      await r.dispose();
    }
    _webAudio.clear();
    _frontCamera = true;
    await _mic?.dispose();
    for (final link in _links.values) {
      await link.pc.close();
    }
    _links.clear();
    _mic = null;
    _video = false;
    _mutedNow = false;
  }
}

/// A fresh media object per call.
final callMediaFactoryProvider =
    Provider<CallMedia Function()>((ref) => WebRtcCallMedia.new);

/// Asks for the microphone before a call is placed or answered (so a refusal
/// never rings the other phone for nothing). True when granted — or when the
/// platform cannot tell (web, tests): the media layer asks again.
final callMicPermissionProvider = Provider<Future<bool> Function()>(
  (ref) => () async {
    if (kIsWeb) return true;
    // Owner 2026-10-22 (audit #13): Android explains first, at the first
    // call (outgoing or answered); «Not now» = no call. The iPhone was
    // asked right after sign-in (push_service.dart, PR #236).
    if (defaultTargetPlatform == TargetPlatform.android &&
        !await ref
            .read(permissionPrimerProvider.notifier)
            .explainMicrophone()) {
      return false;
    }
    try {
      final recorder = AudioRecorder();
      try {
        return await recorder.hasPermission();
      } finally {
        await recorder.dispose();
      }
    } on Object {
      return true;
    }
  },
);
