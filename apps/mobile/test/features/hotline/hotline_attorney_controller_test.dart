import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_providers.dart';
import 'package:lawbid/features/hotline/data/hotline_attorney_repository.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner row 87, scenarios 24.11 (attorney side): what the line does on
/// the phone when a 1:1 call is on, and when the admin switches it off.
class _Repo implements HotlineAttorneyRepository {
  final log = <String>[];

  static const _line = HotlineLine(
    online: true,
    state: 'idle',
    accepting: true,
    states: ['NV'],
    practiceAreas: ['family_law'],
    languages: ['ru'],
    heartbeatSec: 25,
  );

  @override
  Future<HotlineLine> lineOn({
    required List<String> states,
    required List<String> practiceAreas,
    required List<String> languages,
    bool accepting = true,
  }) async {
    log.add('on');
    return _line;
  }

  @override
  Future<HotlineLine> lineOff() async {
    log.add('off');
    return _line;
  }

  @override
  Future<void> decline(String requestId) async => log.add('decline $requestId');

  @override
  Future<(bool, Object?)> heartbeat() async => (true, null);

  @override
  Future<List<HotlineLineCounter>> counters(List<String> keys) async =>
      const [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// A 1:1 call is on; [ringHotline] is the real one.
class _Busy extends CallController {
  _Busy(this.session);
  final CallSession session;

  @override
  CallSession build() => session;
}

class _Flag extends Notifier<bool> {
  @override
  bool build() => true;

  bool get on => state;

  set on(bool v) => state = v;
}

final _flag = NotifierProvider<_Flag, bool>(_Flag.new);

const _peer = CallPeer(id: 'u2', isAttorney: true, displayName: 'Amelia');

void main() {
  late StreamController<RealtimeEvent> events;
  late _Repo repo;

  late SharedPreferences prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  ProviderContainer make(CallSession session) {
    events = StreamController<RealtimeEvent>.broadcast();
    repo = _Repo();
    final c = ProviderContainer(
      overrides: [
        localKvStoreProvider.overrideWithValue(LocalKvStore(prefs)),
        hotlineAttorneyRepositoryProvider.overrideWithValue(repo),
        realtimeEventsProvider.overrideWithValue(events.stream),
        realtimeClientProvider.overrideWithValue(null),
        callControllerProvider.overrideWith(() => _Busy(session)),
        hotlineFlagOnProvider.overrideWith((ref) => ref.watch(_flag)),
      ],
    );
    addTearDown(() {
      c.dispose();
      unawaited(events.close());
    });
    return c;
  }

  Map<String, Object?> offer(String id) => {
        'requestId': id,
        'topic': 'Divorce',
        'state': 'NV',
        'practiceArea': 'family_law',
        'languages': ['ru'],
        'language': 'ru',
        'clientName': 'Anna K.',
        'expiresAt': DateTime.now()
            .add(const Duration(seconds: 10))
            .millisecondsSinceEpoch,
      };

  test(
      'an offer while a 1:1 call is on is declined at once — the client '
      'goes to the next attorney, the 1:1 call is not touched', () async {
    final talking = CallSession(
      phase: CallPhase.active,
      peer: _peer,
      call: AppCall(
        id: 'c1',
        conversationId: 'x',
        status: CallStatus.active,
        outgoing: true,
        peer: _peer,
        createdAt: DateTime(2026, 11, 24),
      ),
    );
    final c = make(talking)
      ..listen(hotlineAttorneyControllerProvider, (_, __) {});
    events.add(RealtimeEvent('hotline:offer', offer('r1')));
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
    expect(repo.log, contains('decline r1'));
    expect(c.read(hotlineAttorneyControllerProvider).call, isNull);
    expect(c.read(callControllerProvider).call?.id, 'c1');
  });

  test(
      'the admin switches the hotline off while he waits → off the line '
      'with the reason', () async {
    final c = make(const CallSession())
      ..listen(hotlineAttorneyControllerProvider, (_, __) {});
    final line = c.read(hotlineAttorneyControllerProvider.notifier);
    await line.goOnline(
      const HotlineChoice(
        practiceAreas: ['family_law'],
        states: ['NV'],
        languages: ['ru'],
      ),
    );
    expect(c.read(hotlineAttorneyControllerProvider).online, isTrue);
    c.read(_flag.notifier).on = false;
    await Future<void>.delayed(Duration.zero);
    final st = c.read(hotlineAttorneyControllerProvider);
    expect(st.online, isFalse);
    expect(st.offReason, 'switched_off');
    expect(repo.log, ['on', 'off']);
  });

  test('«Ответить» on «Клиент ждёт» is remembered for that client only', () {
    final w = HotlineWaiting.fromJson({
      'requestId': 'r2',
      'topic': 'Inheritance',
      'state': 'NV',
      'practiceArea': 'estate',
      'language': 'ru',
      'waitingSince': 1,
    });
    expect(w?.requestId, 'r2');
    expect(HotlineWaiting.fromJson({'requestId': ''}), isNull);
  });
}
