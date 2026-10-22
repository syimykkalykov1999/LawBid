import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';

/// Owner 2026-10-22 (load audit finding 3): running calls are found from
/// the server's `call:ongoing` / `call:ongoing_ended` events — read once,
/// then again only after a reconnect or for a call that just started.
class _History implements CallHistoryRepository {
  _History(this.list);

  List<OngoingGroupCall> list;
  int reads = 0;

  @override
  Future<List<OngoingGroupCall>> ongoing() async {
    reads++;
    return list;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

const _g1 = OngoingGroupCall(
  id: 'call1',
  groupId: 'g1',
  groupTitle: 'Team',
  video: false,
  joined: 2,
  mine: false,
);

void main() {
  late StreamController<RealtimeEvent> events;
  late _History history;
  late ProviderContainer c;

  setUp(() async {
    events = StreamController<RealtimeEvent>.broadcast();
    history = _History([_g1]);
    c = ProviderContainer(
      overrides: [
        realtimeEventsProvider.overrideWithValue(events.stream),
        callHistoryRepositoryProvider.overrideWithValue(history),
        callMyIdProvider.overrideWithValue('me'),
      ],
    )..listen(ongoingGroupCallsProvider, (_, __) {});
    await c.read(ongoingGroupCallsProvider.future);
  });

  tearDown(() async {
    c.dispose();
    await events.close();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  List<OngoingGroupCall> calls() =>
      c.read(ongoingGroupCallsProvider).requireValue;

  test('people joining update the row without asking the server', () async {
    events.add(
      const RealtimeEvent('call:ongoing', {
        'callId': 'call1',
        'groupId': 'g1',
        'joined': 3,
        'joinedIds': ['a', 'b', 'me'],
      }),
    );
    await settle();
    expect(calls().single.joined, 3);
    expect(calls().single.mine, isTrue);
    expect(history.reads, 1);
  });

  test('an ended call leaves without asking the server', () async {
    events.add(
      const RealtimeEvent('call:ongoing_ended', {
        'callId': 'call1',
        'groupId': 'g1',
      }),
    );
    await settle();
    expect(calls(), isEmpty);
    expect(history.reads, 1);
  });

  test('a call that just started and a reconnect read the list once each',
      () async {
    events.add(
      const RealtimeEvent('call:ongoing', {
        'callId': 'call2',
        'groupId': 'g2',
        'joined': 1,
      }),
    );
    await c.read(ongoingGroupCallsProvider.future);
    await settle();
    expect(history.reads, 2);
    events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
    await settle();
    await c.read(ongoingGroupCallsProvider.future);
    expect(history.reads, 3);
  });

  test("a channel's call event is not this list's", () async {
    events.add(
      const RealtimeEvent('call:ongoing', {
        'callId': 'call9',
        'groupId': null,
        'channelId': 'ch1',
        'joined': 40,
      }),
    );
    await settle();
    expect(history.reads, 1);
  });

  test("an open group's bar re-reads only on its own call's events", () async {
    var reads = 0;
    final port = GroupCallPort(
      start: (
        _, {
        required title,
        avatarUrl,
        video = false,
        userIds = const [],
      }) async =>
          null,
      running: (groupId) async {
        reads++;
        return null;
      },
    );
    final g = ProviderContainer(
      overrides: [
        realtimeEventsProvider.overrideWithValue(events.stream),
        groupCallPortProvider.overrideWithValue(port),
      ],
    );
    addTearDown(g.dispose);
    g.listen(groupRunningCallProvider('g1'), (_, __) {});
    await g.read(groupRunningCallProvider('g1').future);
    expect(reads, 1);
    events.add(
      const RealtimeEvent('call:ongoing', {'callId': 'x', 'groupId': 'g2'}),
    );
    await settle();
    await g.read(groupRunningCallProvider('g1').future);
    expect(reads, 1);
    events.add(
      const RealtimeEvent('call:ongoing', {'callId': 'y', 'groupId': 'g1'}),
    );
    await settle();
    await g.read(groupRunningCallProvider('g1').future);
    expect(reads, 2);
  });
}
