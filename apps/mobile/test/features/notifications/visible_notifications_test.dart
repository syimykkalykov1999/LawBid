import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

AppNotification _n(String id, String type) => AppNotification(
      id: id,
      type: type,
      category: NotifCategory.channels,
      payload: const {},
      aggregateCount: 1,
      createdAt: DateTime(2026, 11, 14, 12),
    );

class _Fixed extends NotificationsNotifier {
  _Fixed(this.items);

  final List<AppNotification> items;

  @override
  Future<PaginatedList<AppNotification>> build() async =>
      PaginatedList(items: items, nextCursor: 'c1');
}

// Detective R2 item 22 (14.11): with the `channels` flag off a «Today»
// made only of channel posts showed an empty header, and a list made only
// of them a blank page instead of the empty state.
Future<PaginatedList<AppNotification>> _visible(
  List<AppNotification> items, {
  required bool channels,
}) async {
  final c = ProviderContainer(
    overrides: [
      notificationsProvider.overrideWith(() => _Fixed(items)),
      channelsEnabledProvider.overrideWithValue(channels),
    ],
  );
  addTearDown(c.dispose);
  final sub = c.listen(visibleNotificationsProvider, (_, __) {});
  addTearDown(sub.close);
  await c.read(notificationsProvider.future);
  return c.read(visibleNotificationsProvider).requireValue;
}

void main() {
  test('channels off: channel posts are left out before grouping', () async {
    final list = await _visible(
      [_n('1', 'channel_post'), _n('2', 'bid_new'), _n('3', 'channel_post')],
      channels: false,
    );
    expect(list.items.map((n) => n.id), ['2']);
    expect(list.nextCursor, 'c1');
  });

  test('channels off, only channel posts: the list is empty', () async {
    final list = await _visible(
      [_n('1', 'channel_post'), _n('2', 'channel_post')],
      channels: false,
    );
    expect(list.items, isEmpty);
  });

  test('channels on: every row stays', () async {
    final list = await _visible(
      [_n('1', 'channel_post'), _n('2', 'bid_new')],
      channels: true,
    );
    expect(list.items.map((n) => n.id), ['1', '2']);
  });
}
