import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter/foundation.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';

/// OQ-041: the call state machine — ring out, pick-up, signaling,
/// hang-up; ring in, accept, decline; busy; refusals; answered on another
/// device. WebRTC and the server are fakes.
const _peer = CallPeer(id: 'p1', isAttorney: true, displayName: 'Paul Phone');

AppCall _call(
  String id,
  CallStatus status, {
  required bool outgoing,
  bool video = false,
  List<CallMember> members = const [],
  String? groupId,
}) =>
    AppCall(
      groupId: groupId,
      group: members.isNotEmpty,
      hostId: members.isEmpty ? null : 'p1',
      participants: members,
      id: id,
      conversationId: 'conv',
      status: status,
      outgoing: outgoing,
      peer: _peer,
      createdAt: DateTime(2026, 9, 30),
      video: video,
    );

Map<String, Object?> _event(AppCall c) => {
      'call': {
        'id': c.id,
        'conversationId': c.conversationId,
        'callerId': c.outgoing ? 'me' : 'p1',
        'calleeId': c.outgoing ? 'p1' : 'me',
        'status': c.status.name,
        'outgoing': c.outgoing,
        'peer': {
          'id': 'p1',
          'displayName': 'Paul Phone',
          'username': null,
          'avatarUrl': null,
          'kind': 'attorney',
        },
        'createdAt': '2026-09-30T00:00:00.000Z',
        'answeredAt': null,
        'endedAt': null,
        'durationSec': null,
        'video': c.video,
        'group': c.group,
        'hostId': c.hostId,
        'participants': [
          for (final m in c.participants)
            {
              'userId': m.userId,
              'displayName': m.displayName,
              'username': m.username,
              'avatarUrl': null,
              'status': m.status.name,
              'muted': m.muted,
              'mutedByHost': m.mutedByHost,
              'joinedAt': m.joinedAt?.toUtc().toIso8601String(),
            },
        ],
      },
    };

class _FakeRepo implements CallsRepository {
  CallStatus startStatus = CallStatus.ringing;
  ApiException? refuse;
  final ends = <CallEndReason>[];
  final endedIds = <String>[];
  final accepted = <String>[];
  final declined = <String>[];

  final startedVideo = <bool>[];
  String nextId = 'c1';
  Completer<void>? startGate;
  Completer<void>? getGate;
  CallStatus getStatus = CallStatus.ringing;
  bool getThrows = false;
  int gets = 0;
  List<CallMember> getMembers = const [];

  @override
  Future<AppCall> startGroup(
    String groupId, {
    bool video = false,
    List<String> userIds = const [],
  }) async =>
      throw UnimplementedError();

  @override
  Future<AppCall?> groupCall(String groupId) async => null;

  @override
  Future<AppCall> startChannel(String channelId, {bool video = false}) async =>
      throw UnimplementedError();

  @override
  Future<AppCall?> channelCall(String channelId) async => null;

  @override
  Future<AppCall> join(String callId) async => throw UnimplementedError();

  @override
  Future<AppCall> start(String conversationId, {bool video = false}) async {
    startedVideo.add(video);
    if (startGate != null) await startGate!.future;
    if (refuse != null) throw refuse!;
    return _call(nextId, startStatus, outgoing: true, video: video);
  }

  List<CallMember> acceptMembers = const [];
  String? acceptGroupId = 'grp';

  @override
  Future<AppCall> accept(String callId) async {
    accepted.add(callId);
    return _call(
      callId,
      CallStatus.active,
      outgoing: false,
      members: acceptMembers,
      groupId: acceptMembers.isEmpty ? null : acceptGroupId,
    );
  }

  @override
  Future<AppCall> decline(String callId) async {
    declined.add(callId);
    return _call(callId, CallStatus.declined, outgoing: false);
  }

  /// Whether the media was already closed when the hang-up reached us.
  bool Function()? mediaClosed;
  bool? closedAtEnd;
  int endFailures = 0;
  final endedForAll = <String>[];
  final votesStarted = <String>[];
  final ballots = <bool>[];

  @override
  Future<AppCall> startVote(String callId, String userId) async {
    votesStarted.add(userId);
    return _call(callId, CallStatus.active, outgoing: true);
  }

  @override
  Future<AppCall> castVote(
    String callId,
    String voteId, {
    required bool favor,
  }) async {
    ballots.add(favor);
    return _call(callId, CallStatus.active, outgoing: true);
  }

  @override
  Future<AppCall> end(
    String callId,
    CallEndReason reason, {
    bool forAll = false,
  }) async {
    if (forAll) endedForAll.add(callId);
    closedAtEnd = mediaClosed?.call();
    if (endFailures > 0) {
      endFailures--;
      throw Exception('offline');
    }
    ends.add(reason);
    endedIds.add(callId);
    return _call(callId, CallStatus.ended, outgoing: true);
  }

  @override
  Future<AppCall> get(String callId) async {
    gets++;
    if (getThrows) throw StateError('no network');
    if (getGate != null) await getGate!.future;
    return _call(callId, getStatus, outgoing: false, members: getMembers);
  }

  final invited = <String?>[];
  final muteCalls = <String>[];
  final removeCalls = <String>[];
  final muteStates = <bool>[];
  String? inviteError;

  @override
  Future<AppCall> invite(
    String callId, {
    String? userId,
    String? username,
  }) async {
    if (inviteError != null) {
      throw ApiException(
        code: inviteError!,
        message: 'x',
        statusCode: 409,
      );
    }
    invited.add(userId ?? username);
    return _call(callId, CallStatus.active, outgoing: true);
  }

  @override
  Future<AppCall> muteMember(
    String callId,
    String userId, {
    required bool muted,
  }) async {
    muteCalls.add(userId);
    return _call(callId, CallStatus.active, outgoing: true);
  }

  @override
  Future<AppCall> removeMember(String callId, String userId) async {
    removeCalls.add(userId);
    return _call(callId, CallStatus.active, outgoing: true);
  }

  @override
  Future<void> setMuteState(String callId, {required bool muted}) async =>
      muteStates.add(muted);

  @override
  Future<List<IceServer>> iceServers() async => const [
        IceServer(urls: ['stun:stun.example.com:3478']),
      ];
}

class _FakeMedia implements CallMedia {
  void Function(CallMediaState)? onState;
  bool opened = false;
  bool closed = false;
  bool? muted;
  bool? speaker;
  Map<String, Object?>? gotAnswer;
  final candidates = <Map<String, Object?>>[];

  bool? openedVideo;
  bool? cameraOn;
  int flips = 0;
  int iceRestarts = 0;

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
    this.onState = onState;
    firstPeer = peer;
    links[peer] = onState;
  }

  String firstPeer = '';

  /// Group calls: link state callbacks by member.
  final links = <String, void Function(CallMediaState)>{};
  final offersFor = <String>[];
  final answersFor = <String>[];
  final removed = <String>[];
  final restarted = <String>[];

  @override
  final ValueListenable<Map<String, MediaStream>> remoteStreams =
      ValueNotifier(const {});

  @override
  final ValueListenable<Set<String>> speaking = ValueNotifier(const {});

  @override
  final ValueListenable<LinkQuality> quality = ValueNotifier(LinkQuality.good);

  final iceUpdates = <List<IceServer>>[];

  @override
  Future<void> updateIceServers(List<IceServer> iceServers) async =>
      iceUpdates.add(iceServers);

  @override
  Set<String> get peers => links.keys.toSet();

  @override
  Future<void> addPeer(
    String peer, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async =>
      links[peer] = onState;

  @override
  Future<Map<String, Object?>> createOfferFor(String peer) async {
    offersFor.add(peer);
    return {'type': 'offer', 'sdp': 'offer-sdp'};
  }

  @override
  Future<Map<String, Object?>> answerFor(
    String peer,
    Map<String, Object?> offer,
  ) async {
    answersFor.add(peer);
    return {'type': 'answer', 'sdp': 'answer-to-${offer['sdp']}'};
  }

  @override
  Future<void> setAnswerFor(String peer, Map<String, Object?> answer) async =>
      gotAnswer = answer;

  @override
  Future<void> addCandidateFor(
    String peer,
    Map<String, Object?> candidate,
  ) async =>
      candidates.add(candidate);

  @override
  Future<Map<String, Object?>> restartIceFor(String peer) async {
    restarted.add(peer);
    iceRestarts++;
    return {'type': 'offer', 'sdp': 'x'};
  }

  @override
  Future<void> removePeer(String peer) async {
    removed.add(peer);
    links.remove(peer);
  }

  @override
  final ValueListenable<MediaStream?> localVideo = ValueNotifier(null);

  @override
  final ValueListenable<MediaStream?> remoteVideo = ValueNotifier(null);

  @override
  Future<void> setCameraOn(bool on) async => cameraOn = on;

  @override
  Future<void> switchCamera() async => flips++;

  @override
  Future<Map<String, Object?>> restartIce() async {
    iceRestarts++;
    return {'type': 'offer', 'sdp': 'x'};
  }

  @override
  Future<Map<String, Object?>> createOffer() async =>
      {'type': 'offer', 'sdp': 'offer-sdp'};

  @override
  Future<Map<String, Object?>> answer(Map<String, Object?> offer) async =>
      {'type': 'answer', 'sdp': 'answer-to-${offer['sdp']}'};

  @override
  Future<void> setAnswer(Map<String, Object?> answer) async =>
      gotAnswer = answer;

  @override
  Future<void> addCandidate(Map<String, Object?> candidate) async =>
      candidates.add(candidate);

  @override
  void setMuted(bool muted) => this.muted = muted;

  @override
  Future<void> setSpeaker(bool on) async => speaker = on;

  @override
  Future<void> close() async => closed = true;
}

class _Sounds implements AppSounds {
  final played = <String>[];
  @override
  Future<void> startRingback() async => played.add('ringback');
  @override
  Future<void> stopRingback() async => played.add('stop');
  int kept = 0;
  @override
  Future<void> keepRingback() async => kept++;
  final rings = <String>[];
  @override
  Future<void> startRingtone() async => rings.add('ring');
  @override
  Future<void> stopRingtone() async => rings.add('stop');
  @override
  Future<void> busy() async => played.add('busy');
  @override
  Future<void> callEnded() async => played.add('end');
  @override
  Future<void> messageIn() async => played.add('in');
  @override
  Future<void> messageOut() async => played.add('out');
}

class _FakeForeground implements CallForeground {
  final started = <String>[];
  int stops = 0;
  final _actions = StreamController<String>.broadcast();

  @override
  Stream<String> get actions => _actions.stream;

  @override
  Future<String?> pendingAction() async => null;

  @override
  Future<void> start({
    required String name,
    int since = 0,
    String status = '',
    String hangup = '',
  }) async =>
      started.add('$name|${since > 0}');

  @override
  Future<void> stop() async => stops++;
}

class _SystemUi implements SystemCallUi {
  final dismissed = <String>[];
  int endAlls = 0;

  @override
  Future<void> showIncoming(AppCall call) async {}

  @override
  Future<void> dismiss(String callId) async => dismissed.add(callId);

  @override
  Future<void> showOngoing(AppCall call) async {}

  @override
  Future<void> answered(AppCall call) async {}

  @override
  Future<void> endAll() async => endAlls++;
}

class _Harness {
  _Harness() {
    container = ProviderContainer(
      overrides: [
        callsRepositoryProvider.overrideWithValue(repo),
        callMediaFactoryProvider.overrideWithValue(() => media),
        realtimeEventsProvider.overrideWithValue(events.stream),
        appSoundsProvider.overrideWithValue(sounds),
        callForegroundProvider.overrideWithValue(foreground),
        systemCallUiProvider.overrideWithValue(systemUi),
        callMyIdProvider.overrideWithValue('me'),
        callMicPermissionProvider.overrideWithValue(() async => true),
        callSignalSenderProvider.overrideWithValue((id, data, {to}) async {
          signals.add(data);
          signalTargets.add(to);
          return true;
        }),
      ],
    );
    sub = container.listen(callControllerProvider, (_, __) {});
  }

  final repo = _FakeRepo();
  final sounds = _Sounds();
  final foreground = _FakeForeground();
  final systemUi = _SystemUi();
  final media = _FakeMedia();
  final events = StreamController<RealtimeEvent>.broadcast();
  final signals = <Map<String, Object?>>[];
  final signalTargets = <String?>[];
  late final ProviderContainer container;
  late final ProviderSubscription<CallSession> sub;

  CallController get c => container.read(callControllerProvider.notifier);
  CallSession get s => container.read(callControllerProvider);

  void emit(String name, Object? data) => events.add(RealtimeEvent(name, data));

  Future<void> dispose() async {
    sub.close();
    container.dispose();
    await events.close();
  }
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  test('calling out: rings, picked up, offer/answer, talks, hangs up',
      () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer);
    expect(h.s.phase, CallPhase.outgoing);
    expect(h.media.opened, isTrue);
    // OQ-044: ringback while it rings there.
    expect(h.sounds.played, ['ringback']);
    // The call's audio session opened under it: the tone is kept going.
    expect(h.sounds.kept, 1);

    h.emit(
      'call:accepted',
      _event(_call('c1', CallStatus.active, outgoing: true)),
    );
    await _settle();
    expect(h.s.phase, CallPhase.connecting);
    expect(h.signals.single, {'type': 'offer', 'sdp': 'offer-sdp'});

    h
      ..emit('call:signal', {
        'callId': 'c1',
        'data': {'type': 'answer', 'sdp': 'a'},
      })
      ..emit('call:signal', {
        'callId': 'c1',
        'data': {'type': 'candidate', 'candidate': 'x', 'sdpMid': '0'},
      })
      // Another call's signal is ignored.
      ..emit('call:signal', {
        'callId': 'other',
        'data': {'type': 'answer', 'sdp': 'zzz'},
      });
    await _settle();
    expect(h.media.gotAnswer, {'type': 'answer', 'sdp': 'a'});
    expect(h.media.candidates, hasLength(1));

    h.media.onState!(CallMediaState.connected);
    expect(h.s.phase, CallPhase.active);
    expect(h.s.connectedAt, isNotNull);

    h.c.toggleMute();
    await h.c.toggleSpeaker();
    expect(h.media.muted, isTrue);
    expect(h.media.speaker, isTrue);

    await h.c.hangUp();
    expect(h.s.phase, CallPhase.ended);
    expect(h.s.outcome, CallStatus.ended);
    expect(h.repo.ends, [CallEndReason.hangup]);
    expect(h.media.closed, isTrue);
    expect(h.sounds.played, ['ringback', 'stop', 'end']);
  });

  test('a network drop mid-call shows reconnecting and restarts ICE', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer);
    h.emit(
      'call:accepted',
      _event(_call('c1', CallStatus.active, outgoing: true)),
    );
    await _settle();
    h.media.onState!(CallMediaState.connected);
    expect(h.s.phase, CallPhase.active);

    h.media.onState!(CallMediaState.disconnected);
    await _settle();
    expect(h.s.reconnecting, isTrue);
    expect(h.media.iceRestarts, 1);

    h.media.onState!(CallMediaState.connected);
    expect(h.s.reconnecting, isFalse);
    expect(h.s.phase, CallPhase.active);
    await h.c.hangUp();
  });

  test('hanging up reaches the server before the media closes', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.repo.mediaClosed = () => h.media.closed;
    await h.c.call('conv', peer: _peer, video: true);
    h.emit(
      'call:accepted',
      _event(_call('c1', CallStatus.active, outgoing: true)),
    );
    await _settle();
    h.media.onState!(CallMediaState.connected);
    await h.c.hangUp();
    expect(h.repo.closedAtEnd, isFalse);
    expect(h.media.closed, isTrue);
  });

  test(
      'the hang-up is retried until the server has it (no network for a while)',
      () {
    fakeAsync((async) {
      final h = _Harness();
      h.repo.endFailures = 5;
      h.c.call('conv', peer: _peer);
      async.flushMicrotasks();
      h.c.hangUp();
      async.flushMicrotasks();
      expect(h.s.phase, CallPhase.ended);
      expect(h.repo.ends, isEmpty);
      async.elapse(const Duration(seconds: 40));
      expect(h.repo.ends, hasLength(1));
      h
        ..sub.close()
        ..container.dispose();
    });
  });

  test('409 with no local call: stays open, "end it there" ends that call',
      () async {
    final h = _Harness();
    h.repo.refuse = const ApiException(
      code: 'CALL_IN_PROGRESS',
      message: 'x',
      statusCode: 409,
      details: <String, dynamic>{'callId': 'old1'},
    );
    await h.c.call('conv', peer: _peer);
    await _settle();
    expect(h.s.phase, CallPhase.ended);
    expect(h.s.staleCallId, 'old1');
    // No auto-clear while the sheet is up.
    await Future<void>.delayed(kCallEndedLinger + const Duration(seconds: 1));
    expect(h.s.staleCallId, 'old1');
    await h.c.endOtherDeviceCall();
    expect(h.repo.endedIds, ['old1']);
    expect(h.s.phase, CallPhase.idle);
    expect(h.s.staleCallId, isNull);
    await h.dispose();
  });

  test('409 sheet: cancel clears it without ending anything', () async {
    final h = _Harness();
    h.repo.refuse = const ApiException(
      code: 'CALL_IN_PROGRESS',
      message: 'x',
      statusCode: 409,
      details: <String, dynamic>{'callId': 'old1'},
    );
    await h.c.call('conv', peer: _peer);
    h.c.dismissStale();
    expect(h.s.phase, CallPhase.idle);
    expect(h.repo.endedIds, isEmpty);
    await h.dispose();
  });

  test('the link drops because the other side hung up: closes at once',
      () async {
    final h = _Harness();
    addTearDown(h.dispose);
    await h.c.call('conv', peer: _peer, video: true);
    h.emit(
      'call:accepted',
      _event(_call('c1', CallStatus.active, outgoing: true)),
    );
    await _settle();
    h.media.onState!(CallMediaState.connected);
    expect(h.s.phase, CallPhase.active);

    // The "ended" event never arrives; only the link goes.
    h.repo.getStatus = CallStatus.ended;
    h.media.onState!(CallMediaState.disconnected);
    await _settle();
    expect(h.s.phase, CallPhase.ended);
    expect(h.s.reconnecting, isFalse);
  });

  test("a ringing call is the system sheet's: no second strip in the app",
      () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit(
      'call:incoming',
      _event(_call('c3', CallStatus.ringing, outgoing: false)),
    );
    await _settle();
    expect(h.container.read(systemRingingCallProvider), 'c3');
  });

  test('an invitation into a chat-group call is a light prompt, not a ring',
      () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit(
      'call:invite',
      _event(_call('c4', CallStatus.active, outgoing: false)),
    );
    await _settle();
    expect(h.s.phase, CallPhase.idle);
    expect(h.container.read(callInviteProvider)?.callId, 'c4');
  });

  test('the «Join» prompt goes when that call ends (inbox 20)', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit(
      'call:invite',
      _event(_call('c4', CallStatus.active, outgoing: false)),
    );
    await _settle();
    h.emit(
      'call:ended',
      _event(_call('c9', CallStatus.ended, outgoing: false)),
    );
    await _settle();
    expect(h.container.read(callInviteProvider)?.callId, 'c4');
    h.emit(
      'call:ended',
      _event(_call('c4', CallStatus.ended, outgoing: false)),
    );
    await _settle();
    expect(h.container.read(callInviteProvider), isNull);
  });

  test('ringing in: accept answers the offer', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    h.emit(
      'call:incoming',
      _event(_call('c2', CallStatus.ringing, outgoing: false)),
    );
    await _settle();
    expect(h.s.phase, CallPhase.incoming);
    expect(h.s.peer?.displayName, 'Paul Phone');

    await h.c.accept();
    expect(h.repo.accepted, ['c2']);
    expect(h.s.phase, CallPhase.connecting);

    h.emit('call:signal', {
      'callId': 'c2',
      'data': {'type': 'offer', 'sdp': 'o'},
    });
    await _settle();
    expect(h.signals.single, {'type': 'answer', 'sdp': 'answer-to-o'});

    h.emit(
      'call:ended',
      _event(_call('c2', CallStatus.ended, outgoing: false)),
    );
    await _settle();
    expect(h.s.phase, CallPhase.ended);
    expect(h.s.outcome, CallStatus.ended);
  });

  test(
      'a call lasts an hour: the network blinks, the heartbeat fails for a '
      'while, the link drops and comes back — still the same call', () {
    fakeAsync((async) {
      final h = _Harness();
      h.c.call('conv', peer: _peer);
      async.flushMicrotasks();
      h.emit(
        'call:accepted',
        _event(_call('c1', CallStatus.active, outgoing: true)),
      );
      async.flushMicrotasks();
      h.media.onState!(CallMediaState.connected);
      async.flushMicrotasks();
      expect(h.s.phase, CallPhase.active);
      h.repo.getStatus = CallStatus.active;

      for (var minute = 0; minute < 60; minute++) {
        if (minute % 10 == 5) {
          // Wi-Fi → LTE: the link drops, the requests fail for 40 s.
          h.repo.getThrows = true;
          h.media.onState!(CallMediaState.disconnected);
          async.elapse(const Duration(seconds: 40));
          expect(h.s.phase, CallPhase.active);
          h.repo.getThrows = false;
          h.media.onState!(CallMediaState.connected);
          async.elapse(const Duration(seconds: 20));
        } else {
          async.elapse(const Duration(minutes: 1));
        }
        expect(h.s.phase, CallPhase.active, reason: 'minute $minute');
      }
      // The heartbeat kept running the whole hour.
      expect(h.repo.gets, greaterThan(300));
      h
        ..sub.close()
        ..container.dispose();
    });
  });

  group('the ringing never goes on forever (owner 2026-10-20)', () {
    test('incoming: no "ended" ever arrives → the ringtone stops by itself',
        () {
      fakeAsync((async) {
        final h = _Harness()
          ..emit(
            'call:incoming',
            _event(_call('c2', CallStatus.ringing, outgoing: false)),
          );
        async.flushMicrotasks();
        expect(h.s.phase, CallPhase.incoming);

        async.elapse(kCallRingTimeout);
        expect(h.s.phase, CallPhase.incoming);
        async.elapse(kCallRingGrace + const Duration(seconds: 1));
        expect(h.s.phase, CallPhase.ended);
        expect(h.s.outcome, CallStatus.missed);
        expect(h.sounds.rings.last, 'stop');
        h
          ..sub.close()
          ..container.dispose();
      });
    });

    test('incoming: the caller hung up while this phone had no socket', () {
      fakeAsync((async) {
        final h = _Harness()
          ..emit(
            'call:incoming',
            _event(_call('c2', CallStatus.ringing, outgoing: false)),
          );
        async.flushMicrotasks();
        h.repo.getStatus = CallStatus.canceled;
        async.elapse(kCallSyncInterval + const Duration(seconds: 1));
        expect(h.s.phase, CallPhase.ended);
        expect(h.sounds.rings.last, 'stop');
        h
          ..sub.close()
          ..container.dispose();
      });
    });

    test('outgoing: nobody answers and the server is unreachable', () {
      fakeAsync((async) {
        final h = _Harness();
        h.c.call('conv', peer: _peer);
        async.flushMicrotasks();
        expect(h.s.phase, CallPhase.outgoing);

        async.elapse(kCallRingTimeout + const Duration(seconds: 1));
        expect(h.s.phase, CallPhase.ended);
        expect(h.s.outcome, CallStatus.missed);
        expect(h.sounds.played.last, isNot('ringback'));
        h
          ..sub.close()
          ..container.dispose();
      });
    });
  });

  test('ringing in: decline tells the server and closes', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit(
      'call:incoming',
      _event(_call('c3', CallStatus.ringing, outgoing: false)),
    );
    await _settle();
    await h.c.decline();
    expect(h.repo.declined, ['c3']);
    expect(h.s.outcome, CallStatus.declined);
  });

  test('every end leaves the shade clean (decline and hang-up)', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit(
      'call:incoming',
      _event(_call('c3', CallStatus.ringing, outgoing: false)),
    );
    await _settle();
    await h.c.decline();
    await _settle();
    expect(h.systemUi.dismissed.toSet(), {'c3'});
    expect(h.systemUi.endAlls, greaterThanOrEqualTo(1));

    await h.c.call('conv', peer: _peer);
    await h.c.hangUp();
    await _settle();
    expect(h.systemUi.endAlls, greaterThanOrEqualTo(2));
  });

  test('picked up on another of my devices: this one stops ringing', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit(
      'call:incoming',
      _event(_call('c4', CallStatus.ringing, outgoing: false)),
    );
    await _settle();
    h.emit(
      'call:accepted',
      _event(_call('c4', CallStatus.active, outgoing: false)),
    );
    await _settle();
    expect(h.s.phase, CallPhase.idle);
  });

  test('busy and refusals end at once with the reason', () async {
    final busy = _Harness()..repo.startStatus = CallStatus.busy;
    addTearDown(busy.dispose);
    await busy.c.call('conv');
    expect(busy.s.phase, CallPhase.ended);
    expect(busy.s.outcome, CallStatus.busy);
    expect(busy.sounds.played, ['busy']);

    final refused = _Harness()
      ..repo.refuse = const ApiException(
        code: 'CALL_NOT_ALLOWED',
        message: 'no',
        statusCode: 409,
      );
    addTearDown(refused.dispose);
    await refused.c.call('conv');
    expect(refused.s.phase, CallPhase.ended);
    expect(refused.s.errorCode, 'CALL_NOT_ALLOWED');
  });

  test('a second ring while calling is ignored', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    await h.c.call('conv');
    h.emit(
      'call:incoming',
      _event(_call('other', CallStatus.ringing, outgoing: false)),
    );
    await _settle();
    expect(h.s.call?.id, 'c1');
    expect(h.s.phase, CallPhase.outgoing);
  });

  test('a video call: camera and speaker on, camera toggles and flips',
      () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer, video: true);
    expect(h.repo.startedVideo, [true]);
    expect(h.media.openedVideo, isTrue);
    expect(h.s.video, isTrue);
    expect(h.s.speaker, isTrue);
    expect(h.s.cameraOn, isTrue);

    await h.c.toggleCamera();
    expect(h.s.cameraOn, isFalse);
    expect(h.media.cameraOn, isFalse);
    await h.c.switchCamera();
    expect(h.media.flips, 1);
    await h.c.hangUp();
  });

  test('an audio call never opens the camera', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer);
    expect(h.repo.startedVideo, [false]);
    expect(h.media.openedVideo, isFalse);
    await h.c.toggleCamera();
    await h.c.switchCamera();
    expect(h.media.cameraOn, isNull);
    expect(h.media.flips, 0);
    await h.c.hangUp();
  });

  test('a video call rings in as video and answers with the camera', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    h.emit(
      'call:incoming',
      _event(_call('c9', CallStatus.ringing, outgoing: false, video: true)),
    );
    await _settle();
    expect(h.s.phase, CallPhase.incoming);
    expect(h.s.video, isTrue);
    await h.c.accept();
    expect(h.media.openedVideo, isTrue);
    await h.c.hangUp();
  });

  test('the ongoing-call notification follows the call (owner 2026-10-20)',
      () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer);
    expect(h.foreground.started, ['Paul Phone|false']);

    await h.c.hangUp();
    expect(h.foreground.stops, 1);
  });

  test(
      'a second tap on the call button asks for the call screen, '
      'not a new call', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer);
    final before = h.container.read(callOpenRequestProvider);
    await h.c.call('conv', peer: _peer);
    expect(h.container.read(callOpenRequestProvider), before + 1);
    expect(h.repo.startedVideo, hasLength(1));
  });

  // --- Reviewer tests: known holes (expected to FAIL until fixed) ---------

  test('BUG: cancelling before the server answered must not leave a ghost call',
      () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.repo.startGate = Completer<void>();

    final f = h.c.call('conv', peer: _peer);
    await _settle();
    expect(h.s.phase, CallPhase.outgoing);
    await h.c.hangUp(); // user cancels while the request is in flight
    expect(h.s.phase, CallPhase.ended);

    h.repo.startGate!.complete();
    await f;
    await _settle();
    // The server created call c1: it must be ended, no ringback, no media.
    expect(h.repo.ends, isNotEmpty, reason: 'server call c1 left ringing');
    expect(h.sounds.played.last, isNot('ringback'));
    expect(h.media.opened, isFalse);
  });

  test('BUG: a stale re-read of call A must not end the new call B', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    await h.c.call('conv', peer: _peer); // call c1, ringing
    // The socket came back: the controller re-reads c1 (slow answer, "over").
    h.repo.getStatus = CallStatus.ended;
    h.repo.getGate = Completer<void>();
    h.emit(RealtimeEvent.reconnected, null);
    await _settle();
    await h.c.hangUp();
    h.repo.nextId = 'c2';
    await h.c.call('conv', peer: _peer); // user calls again at once
    expect(h.s.call?.id, 'c2');
    expect(h.s.phase, CallPhase.outgoing);
    h.repo.getGate!.complete();
    await _settle();
    expect(
      h.s.phase,
      CallPhase.outgoing,
      reason: 'call c2 was ended by the answer about call c1',
    );
  });

  group('group calls (owner 2026-10-20)', () {
    CallMember m(
      String id,
      CallMemberStatus st, {
      int at = 0,
      bool mutedByHost = false,
    }) =>
        CallMember(
          userId: id,
          status: st,
          displayName: id,
          muted: mutedByHost,
          mutedByHost: mutedByHost,
          joinedAt: st == CallMemberStatus.joined
              ? DateTime.utc(2026, 10, 20, 8, 0, at)
              : null,
        );

    Future<_Harness> joined({String? groupId = 'grp'}) async {
      // Added to a running call: p1 and p2 are in it, we ring.
      final h = _Harness();
      addTearDown(h.dispose);
      h.repo.acceptGroupId = groupId;
      final ringing = [
        m('p1', CallMemberStatus.joined),
        m('p2', CallMemberStatus.joined, at: 1),
        m('me', CallMemberStatus.invited),
      ];
      h.repo.acceptMembers = [
        m('p1', CallMemberStatus.joined),
        m('p2', CallMemberStatus.joined, at: 1),
        m('me', CallMemberStatus.joined, at: 5),
      ];
      h.emit(
        'call:incoming',
        _event(
          _call(
            'g1',
            CallStatus.active,
            outgoing: false,
            members: ringing,
            groupId: groupId,
          ),
        ),
      );
      await _settle();
      await h.c.accept();
      await _settle();
      return h;
    }

    test('a push for a running call we were added to rings (not dismissed)',
        () async {
      final h = _Harness();
      addTearDown(h.dispose);
      h.repo
        ..getStatus = CallStatus.active
        ..getMembers = [
          m('p1', CallMemberStatus.joined),
          m('p2', CallMemberStatus.joined, at: 1),
          m('me', CallMemberStatus.invited),
        ];
      await h.c.ringFromPush('g9');
      expect(h.s.phase, CallPhase.incoming);
      expect(h.s.call?.group, isTrue);
    });

    test("nobody's media ever arrives: the room stays, no 25 s hang-up", () {
      fakeAsync((async) {
        final h = _Harness();
        h.repo.acceptMembers = [
          m('p1', CallMemberStatus.joined),
          m('me', CallMemberStatus.joined, at: 5),
        ];
        h.emit(
          'call:incoming',
          _event(
            _call(
              'g1',
              CallStatus.active,
              outgoing: false,
              members: [
                m('p1', CallMemberStatus.joined),
                m('me', CallMemberStatus.invited),
              ],
            ),
          ),
        );
        async.flushMicrotasks();
        h.c.accept();
        async
          ..flushMicrotasks()
          ..elapse(kCallConnectTimeout + const Duration(seconds: 5));
        expect(h.s.busy, isTrue);
        expect(h.s.phase, CallPhase.active);
        h
          ..sub.close()
          ..container.dispose();
      });
    });

    test('added to a call: the latest to join offers to everyone', () async {
      final h = await joined();
      expect(h.media.offersFor.toSet(), {'p1', 'p2'});
      expect(h.signalTargets.toSet(), {'p1', 'p2'});
      expect(h.media.peers, {'p1', 'p2'});
    });

    test('a member who joins later: we link them and answer their offer',
        () async {
      final h = await joined();
      h.media.offersFor.clear();
      h
        ..emit('call:participants', {
          'callId': 'g1',
          'hostId': 'p1',
          'participants': [
            for (final x in [
              m('p1', CallMemberStatus.joined),
              m('p2', CallMemberStatus.joined, at: 1),
              m('me', CallMemberStatus.joined, at: 5),
              m('p3', CallMemberStatus.joined, at: 9),
            ])
              {
                'userId': x.userId,
                'displayName': x.displayName,
                'username': null,
                'avatarUrl': null,
                'status': x.status.name,
                'muted': false,
                'mutedByHost': false,
                'joinedAt': x.joinedAt?.toIso8601String(),
              },
          ],
        })
        ..emit('call:signal', {
          'callId': 'g1',
          'from': 'p3',
          'data': {'type': 'offer', 'sdp': 'o3'},
        });
      await _settle();
      expect(h.media.peers, contains('p3'));
      expect(h.media.offersFor, isEmpty);
      expect(h.media.answersFor, ['p3']);
      expect(h.signalTargets.last, 'p3');
      expect(h.s.call?.participants, hasLength(4));
    });

    test('a member who left: their link is closed', () async {
      final h = await joined();
      h.emit('call:participants', {
        'callId': 'g1',
        'hostId': 'p1',
        'participants': [
          for (final x in [
            m('p1', CallMemberStatus.joined),
            m('p2', CallMemberStatus.left),
            m('me', CallMemberStatus.joined, at: 5),
          ])
            {
              'userId': x.userId,
              'displayName': x.displayName,
              'username': null,
              'avatarUrl': null,
              'status': x.status.name,
              'muted': false,
              'mutedByHost': false,
              'joinedAt': x.joinedAt?.toIso8601String(),
            },
        ],
      });
      await _settle();
      expect(h.media.removed, ['p2']);
      expect(h.media.peers, {'p1'});
    });

    test('the host mutes us: the mic goes off, we may switch it on again',
        () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      h.emit('call:muted', {'callId': 'g1', 'muted': true, 'byUserId': 'p1'});
      await _settle();
      expect(h.media.muted, isTrue);
      expect(h.s.muted, isTrue);
      expect(h.s.notice, kNoticeMutedByHost);

      h.c.toggleMute();
      await _settle();
      expect(h.media.muted, isFalse);
      expect(h.s.notice, isNull);
      expect(h.repo.muteStates, [false]);
    });

    test('the host removes us: the call ends here with the reason', () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      h.emit('call:removed', {'callId': 'g1'});
      await _settle();
      expect(h.s.phase, CallPhase.ended);
      expect(h.s.errorCode, kRemovedFromCall);
      expect(h.media.closed, isTrue);
      // The server already took us out: no "end" request.
      expect(h.repo.ends, isEmpty);
    });

    test('a link that drops is retried while the call goes on', () async {
      final h = await joined();
      h.media.links['p1']!(CallMediaState.connected);
      h.media.links['p2']!(CallMediaState.connected);
      expect(h.s.phase, CallPhase.active);

      h.media.links['p2']!(CallMediaState.failed);
      await _settle();
      // Reconnect attempt first (we offered p2), the call is still on.
      expect(h.media.restarted, ['p2']);
      expect(h.s.phase, CallPhase.active);
    });

    test('invite / mute / remove go to the server and report errors', () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      expect(await h.c.invite(userId: 'u9'), isNull);
      expect(h.repo.invited, ['u9']);
      expect(await h.c.muteMember('p2'), isNull);
      expect(h.repo.muteCalls, ['p2']);
      expect(await h.c.removeMember('p2'), isNull);
      expect(h.repo.removeCalls, ['p2']);
      h.repo.inviteError = 'CALL_IN_PROGRESS';
      expect(await h.c.invite(username: 'busy'), 'CALL_IN_PROGRESS');
    });

    test('host: "end for everyone" is sent as forAll; plain leave is not',
        () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      await h.c.hangUp(forAll: true);
      await _settle();
      expect(h.repo.endedForAll, ['g1']);
      expect(h.container.read(groupRejoinProvider), isNull);
    });

    test('a member switches the camera off: the others hear it', () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      h.emit('call:signal', {
        'callId': 'g1',
        'from': 'p2',
        'data': {'type': 'camera', 'on': false},
      });
      await _settle();
      expect(h.container.read(callCamerasOffProvider), {'p2'});
      h.emit('call:signal', {
        'callId': 'g1',
        'from': 'p2',
        'data': {'type': 'camera', 'on': true},
      });
      await _settle();
      expect(h.container.read(callCamerasOffProvider), isEmpty);
    });

    test('leaving a running group call offers the way back', () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      await h.c.hangUp();
      await _settle();
      expect(h.repo.endedForAll, isEmpty);
      expect(h.container.read(groupRejoinProvider)?.groupId, 'grp');
    });

    test('leaving a call made a group by adding people offers the way back',
        () async {
      final h = await joined(groupId: null);
      h.media.onState!(CallMediaState.connected);
      await h.c.hangUp();
      await _settle();
      final r = h.container.read(groupRejoinProvider);
      expect(r?.groupId, isNull);
      expect(r?.callId, 'g1');
    });

    test('the last one out is offered no way back into a finished call',
        () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      h.emit('call:participants', {
        'callId': 'g1',
        'hostId': 'p1',
        'participants': [
          for (final x in [
            m('p1', CallMemberStatus.left),
            m('p2', CallMemberStatus.left),
            m('me', CallMemberStatus.joined, at: 5),
          ])
            {
              'userId': x.userId,
              'displayName': x.displayName,
              'username': null,
              'avatarUrl': null,
              'status': x.status.name,
              'muted': false,
              'mutedByHost': false,
              'joinedAt': x.joinedAt?.toIso8601String(),
            },
        ],
      });
      await _settle();
      await h.c.hangUp();
      await _settle();
      expect(h.container.read(groupRejoinProvider), isNull);
    });

    test('vote to remove: shown, answered, and its end announced', () async {
      final h = await joined();
      h.media.onState!(CallMediaState.connected);
      h.emit('call:vote', {
        'callId': 'g1',
        'result': 'open',
        'targetId': 'p2',
        'vote': {
          'id': 'v1',
          'targetId': 'p2',
          'startedById': 'p1',
          'forCount': 1,
          'againstCount': 0,
          'voters': 2,
          'expiresAt': DateTime.now()
              .add(const Duration(seconds: 30))
              .toUtc()
              .toIso8601String(),
          'myBallot': null,
        },
      });
      await _settle();
      expect(h.s.call?.vote?.id, 'v1');
      expect(await h.c.castVote(favor: true), isNull);
      expect(h.repo.ballots, [true]);
      expect(await h.c.proposeRemoval('p1'), isNull);
      expect(h.repo.votesStarted, ['p1']);
      h.emit('call:vote', {
        'callId': 'g1',
        'result': 'passed',
        'targetId': 'p2',
        'vote': null,
      });
      await _settle();
      expect(h.s.call?.vote, isNull);
      expect(h.s.notice, '$kNoticeVotePassed:p2');
    });
  });
}
