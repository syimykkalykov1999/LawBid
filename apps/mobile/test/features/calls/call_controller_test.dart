import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';

/// OQ-041: the call state machine — ring out, pick-up, signaling,
/// hang-up; ring in, accept, decline; busy; refusals; answered on another
/// device. WebRTC and the server are fakes.
const _peer = CallPeer(id: 'p1', isAttorney: true, displayName: 'Paul Phone');

AppCall _call(String id, CallStatus status, {required bool outgoing}) =>
    AppCall(
      id: id,
      conversationId: 'conv',
      status: status,
      outgoing: outgoing,
      peer: _peer,
      createdAt: DateTime(2026, 9, 30),
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
      },
    };

class _FakeRepo implements CallsRepository {
  CallStatus startStatus = CallStatus.ringing;
  ApiException? refuse;
  final ends = <CallEndReason>[];
  final accepted = <String>[];
  final declined = <String>[];

  @override
  Future<AppCall> start(String conversationId) async {
    if (refuse != null) throw refuse!;
    return _call('c1', startStatus, outgoing: true);
  }

  @override
  Future<AppCall> accept(String callId) async {
    accepted.add(callId);
    return _call(callId, CallStatus.active, outgoing: false);
  }

  @override
  Future<AppCall> decline(String callId) async {
    declined.add(callId);
    return _call(callId, CallStatus.declined, outgoing: false);
  }

  @override
  Future<AppCall> end(String callId, CallEndReason reason) async {
    ends.add(reason);
    return _call(callId, CallStatus.ended, outgoing: true);
  }

  @override
  Future<AppCall> get(String callId) async =>
      _call(callId, CallStatus.ringing, outgoing: false);

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

  @override
  Future<void> open(
    List<IceServer> iceServers, {
    required void Function(Map<String, Object?> signal) onSignal,
    required void Function(CallMediaState state) onState,
  }) async {
    opened = true;
    this.onState = onState;
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
  @override
  Future<void> busy() async => played.add('busy');
  @override
  Future<void> callEnded() async => played.add('end');
  @override
  Future<void> messageIn() async => played.add('in');
  @override
  Future<void> messageOut() async => played.add('out');
}

class _Harness {
  _Harness() {
    container = ProviderContainer(overrides: [
      callsRepositoryProvider.overrideWithValue(repo),
      callMediaFactoryProvider.overrideWithValue(() => media),
      realtimeEventsProvider.overrideWithValue(events.stream),
      appSoundsProvider.overrideWithValue(sounds),
      callSignalSenderProvider.overrideWithValue((id, data) async {
        signals.add(data);
        return true;
      }),
    ]);
    sub = container.listen(callControllerProvider, (_, __) {});
  }

  final repo = _FakeRepo();
  final sounds = _Sounds();
  final media = _FakeMedia();
  final events = StreamController<RealtimeEvent>.broadcast();
  final signals = <Map<String, Object?>>[];
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

    h.emit('call:accepted',
        _event(_call('c1', CallStatus.active, outgoing: true)));
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

  test('ringing in: accept answers the offer', () async {
    final h = _Harness();
    addTearDown(h.dispose);

    h.emit('call:incoming',
        _event(_call('c2', CallStatus.ringing, outgoing: false)));
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
        'call:ended', _event(_call('c2', CallStatus.ended, outgoing: false)));
    await _settle();
    expect(h.s.phase, CallPhase.ended);
    expect(h.s.outcome, CallStatus.ended);
  });

  test('ringing in: decline tells the server and closes', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit('call:incoming',
        _event(_call('c3', CallStatus.ringing, outgoing: false)));
    await _settle();
    await h.c.decline();
    expect(h.repo.declined, ['c3']);
    expect(h.s.outcome, CallStatus.declined);
  });

  test('picked up on another of my devices: this one stops ringing', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    h.emit('call:incoming',
        _event(_call('c4', CallStatus.ringing, outgoing: false)));
    await _settle();
    h.emit('call:accepted',
        _event(_call('c4', CallStatus.active, outgoing: false)));
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
          code: 'CALL_NOT_ALLOWED', message: 'no', statusCode: 409);
    addTearDown(refused.dispose);
    await refused.c.call('conv');
    expect(refused.s.phase, CallPhase.ended);
    expect(refused.s.errorCode, 'CALL_NOT_ALLOWED');
  });

  test('a second ring while calling is ignored', () async {
    final h = _Harness();
    addTearDown(h.dispose);
    await h.c.call('conv');
    h.emit('call:incoming',
        _event(_call('other', CallStatus.ringing, outgoing: false)));
    await _settle();
    expect(h.s.call?.id, 'c1');
    expect(h.s.phase, CallPhase.outgoing);
  });
}
