// ignore_for_file: experimental_member_use

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:lawbid/core/permissions/permission_primer.dart';
import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:record/record.dart' show AudioRecorder;

/// Owner 2026-10-28 (calls variant A, docs/dev/CALLS_REFERENCE_2026-10-28.md):
/// a call's media is a LiveKit room (`livekit_client` 2.13.2, Apache-2.0).
/// Everything below the room — connecting, reconnecting, ICE restarts,
/// network changes, simulcast, who is subscribed to what — is LiveKit's.
/// This file is only the edge between the room and our call screens: the
/// same pictures (flutter_webrtc `MediaStream`s) the screens drew before,
/// and a link state for the call controller.
///
/// The calls into the room follow LiveKit's own examples: connect, then
/// publish the microphone (`livekit-examples/flutter-callkit` ab61c434,
/// lib/main.dart `_connectToRoom`); microphone / camera / speaker / camera
/// flip as `client-sdk-flutter` v2.13.2 example/lib/widgets/controls.dart.

/// Where the room is, for the call controller.
enum CallMediaState {
  /// In the room; nobody else is in it yet.
  connecting,

  /// Somebody else is in the room.
  connected,

  /// LiveKit is reconnecting, or everybody else left the room.
  disconnected,

  /// The room is gone (LiveKit gave up, or the server closed it).
  failed,
}

/// The pictures a call screen draws.
abstract interface class CallMediaView {
  /// Our camera picture; null in an audio call or with the camera off.
  ValueListenable<MediaStream?> get localVideo;

  /// The other side's picture (the first other person in the room).
  ValueListenable<MediaStream?> get remoteVideo;

  /// Group calls: each member's picture by user id (LiveKit identity).
  ValueListenable<Map<String, MediaStream>> get remoteStreams;

  /// Who is speaking now (user ids; [kSelfSpeaker] = us).
  ValueListenable<Set<String>> get speaking;
}

/// [CallMediaView.speaking] key for our own microphone.
const kSelfSpeaker = 'me';

/// What the server hands out for a call's room (POST /calls/:id/livekit-token).
@immutable
class LiveKitJoin {
  const LiveKitJoin({required this.url, required this.token});

  final String url;
  final String token;
}

/// The media side of a call. Kept behind an interface so the call logic is
/// tested without WebRTC.
abstract interface class CallMedia implements CallMediaView {
  Future<void> open(
    LiveKitJoin join, {
    required void Function(CallMediaState state) onState,
    bool video = false,
  });

  /// User ids of the others in the room.
  Set<String> get peers;

  // ignore: avoid_positional_boolean_parameters
  Future<void> setCameraOn(bool on);

  /// Front ↔ back camera.
  Future<void> switchCamera();

  /// The camera is published (a voice call becomes a video call).
  Future<void> enableVideo();

  /// The camera is switched off for real (its light too).
  Future<void> disableVideo();

  // ignore: avoid_positional_boolean_parameters
  void setMuted(bool muted);

  // ignore: avoid_positional_boolean_parameters
  Future<void> setSpeaker(bool on);

  Future<void> close();
}

class LiveKitCallMedia implements CallMedia {
  final _local = ValueNotifier<MediaStream?>(null);
  final _remote = ValueNotifier<MediaStream?>(null);
  final _remotes = ValueNotifier<Map<String, MediaStream>>(const {});
  final _speaking = ValueNotifier<Set<String>>(const {});

  lk.Room? _room;
  lk.EventsListener<lk.RoomEvent>? _listener;
  void Function(CallMediaState state)? _onState;
  bool _closing = false;
  lk.CameraPosition _position = lk.CameraPosition.front;

  @override
  ValueListenable<MediaStream?> get localVideo => _local;
  @override
  ValueListenable<MediaStream?> get remoteVideo => _remote;
  @override
  ValueListenable<Map<String, MediaStream>> get remoteStreams => _remotes;
  @override
  ValueListenable<Set<String>> get speaking => _speaking;

  @override
  Set<String> get peers => {
        for (final p in _room?.remoteParticipants.values ??
            const <lk.RemoteParticipant>[])
          p.identity,
      };

  @override
  Future<void> open(
    LiveKitJoin join, {
    required void Function(CallMediaState state) onState,
    bool video = false,
  }) async {
    _onState = onState;
    final room = lk.Room(
      roomOptions: const lk.RoomOptions(adaptiveStream: true, dynacast: true),
    );
    final listener = room.createListener()
      ..on<lk.ParticipantConnectedEvent>((_) => _changed())
      ..on<lk.ParticipantDisconnectedEvent>((_) => _changed())
      ..on<lk.TrackSubscribedEvent>((_) => _changed())
      ..on<lk.TrackUnsubscribedEvent>((_) => _changed())
      ..on<lk.TrackMutedEvent>((_) => _changed())
      ..on<lk.TrackUnmutedEvent>((_) => _changed())
      ..on<lk.LocalTrackPublishedEvent>((_) => _changed())
      ..on<lk.LocalTrackUnpublishedEvent>((_) => _changed())
      ..on<lk.ActiveSpeakersChangedEvent>((e) {
        final me = room.localParticipant?.identity;
        _speaking.value = {
          for (final p in e.speakers)
            if (p.identity == me) kSelfSpeaker else p.identity,
        };
      })
      ..on<lk.RoomReconnectingEvent>(
        (_) => _emit(CallMediaState.disconnected),
      )
      ..on<lk.RoomReconnectedEvent>((_) => _changed())
      ..on<lk.RoomDisconnectedEvent>((_) {
        if (!_closing) _emit(CallMediaState.failed);
      });
    _room = room;
    _listener = listener;
    await room.connect(join.url, join.token);
    await room.localParticipant?.setMicrophoneEnabled(true);
    if (video) await room.localParticipant?.setCameraEnabled(true);
    _changed();
  }

  void _changed() {
    final room = _room;
    if (room == null || _closing) return;
    final local = room.localParticipant?.videoTrackPublications
        .where((p) => !p.muted)
        .map((p) => p.track)
        .whereType<lk.LocalVideoTrack>()
        .firstOrNull;
    _local.value = local?.mediaStream;
    final streams = <String, MediaStream>{};
    for (final p in room.remoteParticipants.values) {
      final track = p.videoTrackPublications
          .where((t) => t.subscribed && !t.muted)
          .map((t) => t.track)
          .whereType<lk.RemoteVideoTrack>()
          .firstOrNull;
      if (track != null) streams[p.identity] = track.mediaStream;
    }
    if (!mapEquals(streams, _remotes.value)) {
      _remotes.value = Map.unmodifiable(streams);
    }
    _remote.value = streams.values.firstOrNull;
    final someone = room.remoteParticipants.isNotEmpty;
    if (someone) _hadPeer = true;
    _emit(
      someone
          ? CallMediaState.connected
          : _hadPeer
              ? CallMediaState.disconnected
              : CallMediaState.connecting,
    );
  }

  /// Somebody else has been in the room (an empty room after that means
  /// they left).
  bool _hadPeer = false;
  CallMediaState? _last;

  void _emit(CallMediaState s) {
    if (s == _last) return;
    _last = s;
    _onState?.call(s);
  }

  @override
  Future<void> setCameraOn(bool on) async {
    await _room?.localParticipant?.setCameraEnabled(on);
    _changed();
  }

  @override
  Future<void> enableVideo() => setCameraOn(true);

  @override
  Future<void> disableVideo() => setCameraOn(false);

  @override
  Future<void> switchCamera() async {
    final track =
        _room?.localParticipant?.videoTrackPublications.firstOrNull?.track;
    if (track == null) return;
    final next = _position.switched();
    await track.setCameraPosition(next);
    _position = next;
  }

  @override
  void setMuted(bool muted) {
    unawaited(_room?.localParticipant?.setMicrophoneEnabled(!muted));
  }

  @override
  Future<void> setSpeaker(bool on) =>
      lk.AudioManager.instance.setSpeakerOutputPreferred(on);

  @override
  Future<void> close() async {
    _closing = true;
    _onState = null;
    final listener = _listener;
    final room = _room;
    _listener = null;
    _room = null;
    _local.value = null;
    _remote.value = null;
    _remotes.value = const {};
    _speaking.value = const {};
    await room?.disconnect();
    await listener?.dispose();
    await room?.dispose();
  }
}

/// A fresh media object per call.
final callMediaFactoryProvider =
    Provider<CallMedia Function()>((ref) => LiveKitCallMedia.new);

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

/// LiveKit's CallKit pattern (livekit-examples/flutter-callkit ab61c434,
/// lib/main.dart `main`): on iPhone CallKit owns the audio session —
/// LiveKit configures its category but never activates it. The engine is
/// gated in AppDelegate.swift (`LiveKitPlugin.setEngineAvailability`).
Future<void> configureCallAudioForCallKit() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return;
  try {
    await lk.AudioManager.instance.setAudioSessionManagementMode(
      lk.AudioSessionManagementMode.externalCallSystem,
    );
  } on Object catch (e) {
    debugPrint('livekit audio session mode: $e');
  }
}
