import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/application/cloudflare_sfu_call_media.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/data/calls_sfu_api.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

import 'sfu_fakes.dart';

/// Owner 2026-10-24: the call logic over the Cloudflare SFU — which media
/// is used, who is pulled, how the existing controls map, the reconnect, the
/// "no video, work on the server" fallback — and that a p2p call is exactly
/// what it was.
const _group = CallPeer(id: 'g1', isAttorney: false, displayName: 'Team');
final _t0 = DateTime.utc(2026, 10, 24, 10);

CallMember _m(
  String id, {
  Set<String>? tracks,
  CallMemberStatus status = CallMemberStatus.joined,
  int order = 0,
}) =>
    CallMember(
      userId: id,
      status: status,
      displayName: id,
      joinedAt: _t0.add(Duration(seconds: order)),
      sfuTracks: tracks,
    );

AppCall _call({
  required CallMediaProvider provider,
  bool video = false,
  List<CallMember>? members,
  CallMediaFallback? fallback,
}) =>
    AppCall(
      id: 'c1',
      conversationId: null,
      groupId: 'g1',
      status: CallStatus.active,
      outgoing: true,
      peer: _group,
      createdAt: _t0,
      video: video,
      group: true,
      hostId: 'me',
      participants: members ??
          [
            _m('me', tracks: {'mic'}),
          ],
      mediaProvider: provider,
      mediaFallback: fallback,
    );

class _Repo extends Fake implements CallsRepository {
  _Repo(this.call);
  AppCall call;
  final ended = <CallEndReason>[];
  final muteStates = <bool>[];

  @override
  Future<AppCall> join(String callId) async => call;

  @override
  Future<AppCall> get(String callId) async => call;

  @override
  Future<bool> providerSupported() async => true;

  final iceAsks = <bool>[];

  @override
  Future<List<IceServer>> iceServers({bool relayFailed = false}) async {
    iceAsks.add(relayFailed);
    return const [
      IceServer(urls: ['stun:t.example.com:3478']),
    ];
  }

  @override
  Future<AppCall> end(
    String callId,
    CallEndReason reason, {
    bool forAll = false,
  }) async {
    ended.add(reason);
    return call;
  }

  @override
  Future<void> setMuteState(String callId, {required bool muted}) async =>
      muteStates.add(muted);
}

/// The SFU media with everything recorded; what the controller does not use
/// throws (Fake).
class _SfuMedia extends Fake implements SfuCallMedia {
  void Function(CallMediaState)? onState;
  bool? openedVideo;
  bool closed = false;
  bool? muted;
  bool? cameraOn;
  int videoEnables = 0;
  int videoDisables = 0;
  int reconnects = 0;
  int flips = 0;
  final rosters = <Map<String, Set<String>?>>[];
  final layers = <Map<String, SfuRid>>[];
  final order = <String>[];

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
    String peer = '',
  }) async {
    openedVideo = video;
    this.onState = onState;
    order.add('open');
  }

  @override
  Set<String> get peers => const {};

  @override
  Future<void> syncRoster(Map<String, Set<String>?> others) async {
    rosters.add(Map.of(others));
    order.add('roster');
  }

  @override
  void setLayers(Map<String, SfuRid> wanted) => layers.add(Map.of(wanted));

  @override
  Future<void> reconnect() async => reconnects++;

  @override
  void setMuted(bool muted) => this.muted = muted;

  @override
  Future<void> setCameraOn(bool on) async => cameraOn = on;

  @override
  Future<void> enableVideo() async => videoEnables++;

  @override
  Future<void> disableVideo() async => videoDisables++;

  @override
  Future<void> switchCamera() async => flips++;

  @override
  Future<void> setSpeaker(bool on) async {}

  @override
  Future<void> updateIceServers(List<IceServer> iceServers) async {}

  @override
  Future<void> close() async => closed = true;

  @override
  Future<bool> offerPendingFor(String peer) async => false;
}

/// A mesh media: counts, never talks.
class _MeshMedia extends Fake implements CallMedia {
  bool opened = false;
  bool? openedVideo;
  bool? muted;
  final links = <String>{};
  final linkStates = <String, void Function(CallMediaState)>{};

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
    bool video = false,
    String peer = '',
  }) async {
    opened = true;
    openedVideo = video;
  }

  @override
  Set<String> get peers => links;

  @override
  Future<void> addPeer(
    String peer, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async {
    links.add(peer);
    linkStates[peer] = onState;
  }

  @override
  Future<Map<String, Object?>> createOfferFor(String peer) async =>
      {'type': 'offer', 'sdp': 'x'};

  @override
  Future<bool> offerPendingFor(String peer) async => false;

  @override
  Future<Map<String, Object?>> answerFor(
    String peer,
    Map<String, Object?> offer,
  ) async =>
      {'type': 'answer', 'sdp': 'y'};

  @override
  Future<void> removePeer(String peer) async => links.remove(peer);

  @override
  Future<void> setSpeaker(bool on) async {}

  @override
  void setMuted(bool muted) => this.muted = muted;

  @override
  Future<void> updateIceServers(List<IceServer> iceServers) async {}

  @override
  Future<void> close() async {}

  @override
  final ValueListenable<MediaStream?> localVideo = ValueNotifier(null);
}

class _Sounds implements AppSounds {
  @override
  Future<void> startRingback() async {}
  @override
  Future<void> stopRingback() async {}
  @override
  Future<void> keepRingback() async {}
  @override
  Future<void> startRingtone() async {}
  @override
  Future<void> stopRingtone() async {}
  @override
  Future<void> busy() async {}
  @override
  Future<void> callEnded() async {}
  @override
  Future<void> messageIn() async {}
  @override
  Future<void> messageOut() async {}
  @override
  Future<void> videoRequest() async {}
}

class _Foreground implements CallForeground {
  final _a = StreamController<String>.broadcast();
  @override
  Stream<String> get actions => _a.stream;
  @override
  Future<String?> pendingAction() async => null;
  @override
  Future<void> start({
    required String name,
    int since = 0,
    String status = '',
    String hangup = '',
  }) async {}
  @override
  Future<void> stop() async {}
}

class _SystemUi implements SystemCallUi {
  @override
  Future<void> showIncoming(AppCall call) async {}
  @override
  Future<void> dismiss(String callId) async {}
  @override
  Future<void> showOngoing(AppCall call) async {}
  @override
  Future<void> answered(AppCall call) async {}
  @override
  Future<void> endAll() async {}
}

class _H {
  _H(AppCall call) : repo = _Repo(call) {
    container = ProviderContainer(
      overrides: [
        callsRepositoryProvider.overrideWithValue(repo),
        callsSfuApiProvider.overrideWithValue(FakeSfuApi()),
        sfuCallMediaFactoryProvider.overrideWithValue((id, api) {
          sfuCreated++;
          return sfu;
        }),
        callMediaFactoryProvider.overrideWithValue(() {
          meshCreated++;
          return mesh;
        }),
        realtimeEventsProvider.overrideWithValue(events.stream),
        appSoundsProvider.overrideWithValue(_Sounds()),
        callForegroundProvider.overrideWithValue(_Foreground()),
        systemCallUiProvider.overrideWithValue(_SystemUi()),
        callMyIdProvider.overrideWithValue('me'),
        callMicPermissionProvider.overrideWithValue(() async => true),
        callSignalSenderProvider.overrideWithValue((id, data, {to}) async {
          signals.add(data);
          return true;
        }),
      ],
    );
    sub = container.listen(callControllerProvider, (_, __) {});
  }

  final _Repo repo;
  final sfu = _SfuMedia();
  final mesh = _MeshMedia();
  int sfuCreated = 0;
  int meshCreated = 0;
  final events = StreamController<RealtimeEvent>.broadcast();
  final signals = <Map<String, Object?>>[];
  late final ProviderContainer container;
  late final ProviderSubscription<CallSession> sub;

  CallController get c => container.read(callControllerProvider.notifier);
  CallSession get s => container.read(callControllerProvider);

  Future<String?> join() => c.joinGroupCall(repo.call, peer: _group);

  void emit(String name, Object? data) => events.add(RealtimeEvent(name, data));

  /// A `call:participants` event as the server sends it.
  void participants(
    List<CallMember> members, {
    bool? video,
    bool blocked = false,
    String provider = 'cloudflare',
  }) =>
      emit('call:participants', {
        'callId': 'c1',
        'hostId': 'me',
        'mediaProvider': provider,
        if (video != null) 'video': video,
        'mediaFallback': {
          'active': blocked,
          'reason': blocked ? 'sfu_unavailable' : null,
          'videoBlocked': blocked,
          'videoMaxParticipants': 4,
        },
        'participants': [
          for (final m in members)
            {
              'userId': m.userId,
              'displayName': m.userId,
              'status': m.status.name,
              'muted': m.muted,
              'mutedByHost': false,
              'joinedAt': m.joinedAt?.toIso8601String(),
              'sfuReady': (m.sfuTracks ?? const {}).isNotEmpty,
              if (m.sfuTracks != null) 'sfuTracks': m.sfuTracks!.toList(),
            },
        ],
      });

  Future<void> dispose() async {
    sub.close();
    container.dispose();
    await events.close();
  }
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  group('a call carried by the Cloudflare SFU', () {
    test('the SFU media is used, the mesh never; the others are pulled',
        () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.cloudflare,
          members: [
            _m('me', tracks: {'mic'}),
            _m('u1', tracks: {'mic', 'cam'}, order: 1),
          ],
        ),
      );
      addTearDown(h.dispose);
      expect(await h.join(), isNull);
      expect(h.sfuCreated, 1);
      expect(h.meshCreated, 0);
      expect(h.s.phase, CallPhase.active);
      await _settle();
      // Open first, then the roster (everybody but us).
      expect(h.sfu.order, ['open', 'roster']);
      expect(h.sfu.rosters.last, {
        'u1': {'mic', 'cam'},
      });
      // No offer between members is made on an SFU call.
      expect(h.signals.where((e) => e['type'] == 'offer'), isEmpty);
    });

    test('call:participants: a newcomer is pulled, one who left is let go',
        () async {
      final h = _H(_call(provider: CallMediaProvider.cloudflare));
      addTearDown(h.dispose);
      await h.join();
      h.participants([
        _m('me', tracks: {'mic'}),
        _m('u1', tracks: {'mic'}, order: 1),
      ]);
      await _settle();
      expect(h.sfu.rosters.last, {
        'u1': {'mic'},
      });
      h.participants([
        _m('me', tracks: {'mic'}),
        _m('u1', tracks: {'mic', 'cam'}, order: 1),
        _m('u2', tracks: {'mic'}, order: 2),
        _m('u3', status: CallMemberStatus.left, order: 3),
        _m('u4', status: CallMemberStatus.invited, order: 4),
      ]);
      await _settle();
      // Only joined people are pulled.
      expect(h.sfu.rosters.last, {
        'u1': {'mic', 'cam'},
        'u2': {'mic'},
      });
      h.participants([
        _m('me', tracks: {'mic'}),
        _m('u2', tracks: {'mic'}, order: 2),
      ]);
      await _settle();
      expect(h.sfu.rosters.last, {
        'u2': {'mic'},
      });
    });

    test('a member list without sfuTracks (GET /calls/:id) is "unknown"',
        () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.cloudflare,
          members: [_m('me'), _m('u1', order: 1)],
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      await _settle();
      expect(h.sfu.rosters.last, {'u1': null});
    });

    test('stray offers / answers / candidates are not applied', () async {
      final h = _H(_call(provider: CallMediaProvider.cloudflare));
      addTearDown(h.dispose);
      await h.join();
      for (final t in ['offer', 'answer', 'candidate']) {
        h.emit('call:signal', {
          'callId': 'c1',
          'from': 'u1',
          'data': {'type': t, 'sdp': 'x', 'candidate': 'c'},
        });
      }
      await _settle();
      // The media (which would throw on any of them) was not touched and the
      // call stays up.
      expect(h.s.phase, CallPhase.active);
      expect(h.signals, isEmpty);
    });

    test('mute, camera, speaker map onto the media; leaving closes it',
        () async {
      final h = _H(_call(provider: CallMediaProvider.cloudflare, video: true));
      addTearDown(h.dispose);
      await h.join();
      expect(h.sfu.openedVideo, isTrue);
      h.c.toggleMute();
      expect(h.sfu.muted, isTrue);
      expect(h.repo.muteStates, [true]);
      await h.c.toggleCamera();
      expect(h.sfu.cameraOn, isFalse);
      await h.c.toggleCamera();
      expect(h.sfu.cameraOn, isTrue);
      await h.c.switchCamera();
      expect(h.sfu.flips, 1);
      // The other members hear the camera flag over the call signal.
      expect(
        h.signals.where((e) => e['type'] == 'camera').map((e) => e['on']),
        [false, true],
      );
      await h.c.hangUp();
      expect(h.sfu.closed, isTrue);
      expect(h.repo.ended, [CallEndReason.hangup]);
    });

    test(
        'a voice call turns the camera on: published by the media, no '
        'new offers to anyone', () async {
      final h = _H(_call(provider: CallMediaProvider.cloudflare));
      addTearDown(h.dispose);
      await h.join();
      await h.c.toggleVideo();
      expect(h.sfu.videoEnables, 1);
      expect(h.s.video, isTrue);
      expect(h.signals.where((e) => e['type'] == 'offer'), isEmpty);
      expect(h.signals.where((e) => e['type'] == 'video'), isNotEmpty);
      await h.c.toggleVideo();
      expect(h.sfu.videoDisables, 1);
    });

    test('video calls of up to 20 people can switch the camera', () async {
      final many = [
        _m('me', tracks: {'mic'}),
        for (var i = 1; i < 15; i++) _m('u$i', tracks: {'mic'}, order: i),
      ];
      final h =
          _H(_call(provider: CallMediaProvider.cloudflare, members: many));
      addTearDown(h.dispose);
      await h.join();
      expect(h.c.canSwitchVideo, isTrue);
    });

    test('layers follow the tile: the big one full, the strip quarter',
        () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.cloudflare,
          video: true,
          members: [
            _m('me', tracks: {'mic', 'cam'}),
            _m('u1', tracks: {'mic', 'cam'}, order: 1),
            _m('u2', tracks: {'mic', 'cam'}, order: 2),
            _m('u3', tracks: {'mic', 'cam'}, order: 3),
          ],
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      await _settle();
      // A 2x2 grid: the half layer for everybody.
      expect(h.sfu.layers.last, {
        'u1': SfuRid.h,
        'u2': SfuRid.h,
        'u3': SfuRid.h,
      });
      h.container.read(callVideoLayoutProvider.notifier).toggleFocus('u2');
      await _settle();
      expect(h.sfu.layers.last, {
        'u1': SfuRid.q,
        'u2': SfuRid.f,
        'u3': SfuRid.q,
      });
      h.container.read(callVideoLayoutProvider.notifier).clearFocus();
      await _settle();
      expect(h.sfu.layers.last['u2'], SfuRid.h);
    });

    test(
        'the link drops: "reconnecting", then the media is asked to '
        'reconnect (ICE restart, else a new session)', () async {
      // Two people: alone, the call would end by itself after 3 s.
      final h = _H(
        _call(
          provider: CallMediaProvider.cloudflare,
          members: [
            _m('me', tracks: {'mic'}),
            _m('u1', tracks: {'mic'}, order: 1),
          ],
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      h.sfu.onState!(CallMediaState.connected);
      expect(h.s.reconnecting, isFalse);
      h.sfu.onState!(CallMediaState.disconnected);
      await _settle();
      expect(h.sfu.reconnects, greaterThanOrEqualTo(1));
      // Owner 2026-10-26: «Reconnecting…» only once the drop lasts > 3 s.
      expect(h.s.reconnecting, isFalse);
      await Future<void>.delayed(
        kCallReconnectingDelay + const Duration(milliseconds: 100),
      );
      expect(h.s.reconnecting, isTrue);
      h.sfu.onState!(CallMediaState.connected);
      expect(h.s.reconnecting, isFalse);
      expect(h.s.phase, CallPhase.active);
      // The socket came back (the network changed): look for a new route.
      final before = h.sfu.reconnects;
      h.emit(RealtimeEvent.reconnected, null);
      await _settle();
      expect(h.sfu.reconnects, greaterThan(before));
      await h.c.hangUp();
    });
  });

  group('Cloudflare is down: audio only for a crowd', () {
    test('the camera does not go on; the call goes on with audio', () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.p2p,
          members: [
            for (var i = 0; i < 6; i++) _m(i == 0 ? 'me' : 'u$i', order: i),
          ],
          fallback: const CallMediaFallback(
            active: true,
            reason: 'sfu_unavailable',
            videoBlocked: true,
          ),
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      expect(h.c.videoBlocked, isTrue);
      await h.c.toggleVideo();
      expect(h.mesh.opened, isTrue);
      expect(h.s.video, isFalse);
      expect(h.s.cameraOn, isTrue); // untouched: no camera was opened
      expect(h.signals.where((e) => e['type'] == 'video'), isEmpty);
      expect(h.s.phase, CallPhase.active);
    });

    test(
        'the crowd came: the server drops the call to audio, our camera '
        'goes off', () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.p2p,
          video: true,
          members: [_m('me'), _m('u1', order: 1)],
          fallback: const CallMediaFallback(active: true),
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      expect(h.c.videoBlocked, isFalse);
      h.participants(
        [for (var i = 0; i < 6; i++) _m(i == 0 ? 'me' : 'u$i', order: i)],
        video: false,
        blocked: true,
        provider: 'p2p',
      );
      await _settle();
      expect(h.c.videoBlocked, isTrue);
      expect(h.s.cameraOn, isFalse);
      expect(h.s.call!.video, isFalse);
    });

    test('with fewer people the camera is free again', () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.p2p,
          members: [_m('me'), _m('u1', order: 1)],
          fallback: const CallMediaFallback(active: true, videoBlocked: true),
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      h.participants(
        [_m('me'), _m('u1', order: 1)],
        provider: 'p2p',
      );
      await _settle();
      expect(h.c.videoBlocked, isFalse);
    });
  });

  group('failover: Cloudflare SFU fails mid-call', () {
    test(
        'the server moves the call to the mesh: the SFU media is swapped for '
        'the mesh in the background — same call id, never ended, mic state '
        'kept, no «Reconnecting…» for a quick swap', () async {
      final members = [
        _m('me', tracks: {'mic'}),
        _m('u1', tracks: {'mic'}, order: -1),
      ];
      final h = _H(
        _call(provider: CallMediaProvider.cloudflare, members: members),
      );
      addTearDown(h.dispose);
      await h.join();
      h.sfu.onState!(CallMediaState.connected);
      h.c.toggleMute();
      expect(h.s.muted, isTrue);
      await _settle();

      // The server: «this call now runs on our own path».
      h.repo.call = _call(
        provider: CallMediaProvider.p2p,
        members: [_m('me'), _m('u1', order: -1)],
      );
      h.participants([_m('me'), _m('u1', order: -1)], provider: 'p2p');
      await _settle();

      expect(h.sfu.closed, isTrue);
      expect(h.meshCreated, 1);
      expect(h.mesh.opened, isTrue);
      expect(h.s.call?.id, 'c1');
      expect(h.s.call?.viaSfu, isFalse);
      expect(h.s.phase, CallPhase.active);
      expect(h.repo.ended, isEmpty);
      // The microphone stays as it was (muted).
      expect(h.mesh.muted, isTrue);
      // The later joiner (us) links up to u1 and offers.
      expect(h.mesh.links, {'u1'});
      expect(h.signals.where((e) => e['type'] == 'offer'), hasLength(1));
      // The SFU media is gone for good: its late «failed» ends nothing.
      h.sfu.onState!(CallMediaState.failed);
      await _settle();
      expect(h.s.phase, CallPhase.active);

      // The mesh connects within the 3 s: «Reconnecting…» never showed.
      expect(h.s.reconnecting, isFalse);
      h.mesh.linkStates['u1']!(CallMediaState.connected);
      await Future<void>.delayed(
        kCallReconnectingDelay + const Duration(milliseconds: 100),
      );
      expect(h.s.reconnecting, isFalse);
      expect(h.s.phase, CallPhase.active);
      await h.c.hangUp();
    });

    test(
        'a swap that takes longer than 3 s shows «Reconnecting…» until the '
        'mesh connects', () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.cloudflare,
          members: [
            _m('me', tracks: {'mic'}),
            _m('u1', tracks: {'mic'}, order: -1),
          ],
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      h.sfu.onState!(CallMediaState.connected);
      h.repo.call = _call(
        provider: CallMediaProvider.p2p,
        members: [_m('me'), _m('u1', order: -1)],
      );
      h.participants([_m('me'), _m('u1', order: -1)], provider: 'p2p');
      await _settle();
      expect(h.s.reconnecting, isFalse);
      await Future<void>.delayed(
        kCallReconnectingDelay + const Duration(milliseconds: 100),
      );
      expect(h.s.reconnecting, isTrue);
      h.mesh.linkStates['u1']!(CallMediaState.connected);
      expect(h.s.reconnecting, isFalse);
      expect(h.s.phase, CallPhase.active);
      await h.c.hangUp();
    });

    test('a missed event: the resync (GET /calls/:id) swaps too', () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.cloudflare,
          members: [
            _m('me', tracks: {'mic'}),
            _m('u1', tracks: {'mic'}, order: -1),
          ],
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      h.sfu.onState!(CallMediaState.connected);
      h.repo.call = _call(
        provider: CallMediaProvider.p2p,
        members: [_m('me'), _m('u1', order: -1)],
      );
      // A member already on the mesh offers: the offer is kept and the
      // server is asked; the swap follows and the offer is answered there.
      h.emit('call:signal', {
        'callId': 'c1',
        'from': 'u1',
        'data': {'type': 'offer', 'sdp': 'x'},
      });
      await _settle();
      expect(h.sfu.closed, isTrue);
      expect(h.meshCreated, 1);
      expect(h.s.phase, CallPhase.active);
      expect(h.signals.where((e) => e['type'] == 'answer'), hasLength(1));
      await h.c.hangUp();
    });
  });

  group('a p2p call is what it was', () {
    test('a mesh group call keeps the mesh media and its own offers', () async {
      final h = _H(
        _call(
          provider: CallMediaProvider.p2p,
          members: [_m('me'), _m('u1', order: -1)],
        ),
      );
      addTearDown(h.dispose);
      await h.join();
      await _settle();
      expect(h.meshCreated, 1);
      expect(h.sfuCreated, 0);
      // The later joiner (us) links up and offers, as before.
      expect(h.mesh.links, {'u1'});
      expect(h.signals.where((e) => e['type'] == 'offer'), hasLength(1));
    });

    test('capacity: an SFU call holds 20, a mesh call 9', () {
      expect(
        _call(provider: CallMediaProvider.cloudflare, video: true).capacity,
        20,
      );
      expect(_call(provider: CallMediaProvider.p2p, video: true).capacity, 9);
    });
  });
}
