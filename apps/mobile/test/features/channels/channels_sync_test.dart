import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

import 'channels_fakes.dart';

/// Owner 2026-10-22 (delta audit D-P2, Telegram): the channel lists are not
/// reloaded whole. My own writes are applied to the rows (0 requests); a
/// reconnect is one `updatedSince`, not the whole list again.
void main() {
  late FakeChannelsRepository repo;
  late StreamController<RealtimeEvent> events;
  late ProviderContainer c;

  const mine = (scope: ChannelScope.subscribed, query: '');

  setUp(() {
    events = StreamController<RealtimeEvent>.broadcast();
    addTearDown(events.close);
    repo = FakeChannelsRepository()
      ..listed = [
        fakeChannel(id: 'a', subscribed: true),
        fakeChannel(id: 'b', title: 'B', username: 'b', subscribed: true),
      ];
    c = ProviderContainer(
      overrides: [
        ...channelsOverrides(repo),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
    addTearDown(c.dispose);
  });

  int fulls() => repo.calls.where((x) => x.startsWith('list:')).length;
  int deltas() => repo.calls.where((x) => x.startsWith('delta:')).length;

  Future<List<String>> ids() async =>
      (await c.read(channelListProvider(mine).future))
          .map((x) => x.id)
          .toList();

  test('my follow / unfollow is applied to the rows, 0 requests', () async {
    final sub = c.listen(channelListProvider(mine), (_, __) {});
    addTearDown(sub.close);
    expect(await ids(), ['a', 'b']);
    expect(fulls(), 1);

    final hub = c.read(channelListHubProvider)
      ..apply(fakeChannel(id: 'a'));
    await Future<void>.delayed(Duration.zero);
    expect(await ids(), ['b']);

    hub.apply(
      fakeChannel(id: 'z', title: 'Z', username: 'z', subscribed: true),
    );
    await Future<void>.delayed(Duration.zero);
    expect((await ids()).toSet(), {'b', 'z'});
    expect(fulls(), 1, reason: 'no list was read again');
    expect(deltas(), 0);
  });

  test('a reconnect is one small updatedSince, not the list again', () async {
    final sub = c.listen(channelListProvider(mine), (_, __) {});
    addTearDown(sub.close);
    await ids();
    repo
      ..changedRows = [
        fakeChannel(id: 'b', title: 'B renamed', subscribed: true),
      ]
      ..deletedRows = ['a'];

    events.add(const RealtimeEvent(RealtimeEvent.reconnected, null));
    await Future<void>.delayed(const Duration(milliseconds: 900));

    expect(deltas(), 1);
    expect(fulls(), 1);
    final rows = await c.read(channelListProvider(mine).future);
    expect(rows.map((x) => x.id), ['b']);
    expect(rows.single.title, 'B renamed');
  });

  test('a burst of changes the phone cannot place is one request', () async {
    final sub = c.listen(channelListProvider(mine), (_, __) {});
    addTearDown(sub.close);
    await ids();
    final hub = c.read(channelListHubProvider);
    for (var i = 0; i < 5; i++) {
      hub.catchUp();
    }
    await Future<void>.delayed(const Duration(milliseconds: 900));
    expect(deltas(), 1);
    expect(fulls(), 1);
  });

  test('deleting a channel drops it from every list, 0 requests', () async {
    final sub = c.listen(channelListProvider(mine), (_, __) {});
    addTearDown(sub.close);
    await ids();
    c.read(channelListHubProvider).drop('a');
    await Future<void>.delayed(Duration.zero);
    expect(await ids(), ['b']);
    expect(fulls() + deltas(), 1);
  });

  test('the Archive list takes a channel I archived', () async {
    final s1 = c.listen(channelListProvider(mine), (_, __) {});
    final s2 = c.listen(archivedChannelsProvider, (_, __) {});
    addTearDown(s1.close);
    addTearDown(s2.close);
    await ids();
    await c.read(archivedChannelsProvider.future);
    expect(fulls(), 2);

    c.read(channelListHubProvider).apply(
          fakeChannel(id: 'a', subscribed: true).copyWith(isArchived: true),
        );
    await Future<void>.delayed(Duration.zero);
    expect(await ids(), ['b']);
    expect((await c.read(archivedChannelsProvider.future)).map((x) => x.id), [
      'a',
    ]);
    expect(fulls(), 2);
  });
}
