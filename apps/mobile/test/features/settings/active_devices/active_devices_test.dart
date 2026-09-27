import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/stub_auth_repository.dart';
import 'package:lawbid/features/settings/active_devices/active_devices_providers.dart';
import 'package:lawbid/features/settings/active_devices/application/active_devices_controller.dart';
import 'package:lawbid/features/settings/active_devices/data/active_devices_repository_impl.dart';
import 'package:lawbid/features/settings/active_devices/data/device_session_mapper.dart';
import 'package:lawbid/features/settings/active_devices/domain/active_devices_repository.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/features/settings/active_devices/presentation/active_devices_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../../helpers/fake_http_adapter.dart';
import '../../../helpers/ux_harness.dart';

DeviceSessionInfo _session(String id, {bool current = false}) =>
    DeviceSessionInfo(
      sessionId: id,
      deviceName: 'Device $id',
      platform: DevicePlatform.ios,
      createdAt: DateTime.utc(2026, 9),
      isCurrent: current,
    );

/// Scripted repository: pages keyed by cursor (null = first page).
class _PagedRepo implements ActiveDevicesRepository {
  _PagedRepo(this.pages);

  final Map<String?, CursorPage<DeviceSessionInfo>> pages;
  final List<String?> requested = [];
  final List<String> revoked = [];
  Object? failNext;

  /// Cursors whose FIRST request fails with a network error.
  final Set<String?> failOnce = {};
  Completer<void>? hold;

  @override
  Future<CursorPage<DeviceSessionInfo>> fetchPage({String? cursor}) async {
    requested.add(cursor);
    final gate = hold;
    if (gate != null) await gate.future;
    final error = failNext;
    if (error != null) {
      failNext = null;
      throw error;
    }
    if (failOnce.remove(cursor)) throw _network;
    return pages[cursor]!;
  }

  @override
  Future<void> revoke(String sessionId) async => revoked.add(sessionId);

  @override
  Future<void> logoutAll() async {}
}

const _network = ApiException(
  code: ApiException.networkErrorCode,
  message: 'offline',
);

void main() {
  group('DeviceSessionMapper (DTO → domain)', () {
    test('maps every field and parses timestamps as UTC', () {
      final info = DeviceSessionMapper.toDomain(
        const DeviceSession(
          sessionId: 's1',
          deviceId: 'd1',
          deviceName: 'Pixel 9',
          platform: 'ANDROID',
          appVersion: '1.2.0',
          lastUsedAt: '2026-09-26T10:30:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
          isCurrent: true,
        ),
      );
      expect(info.sessionId, 's1');
      expect(info.deviceName, 'Pixel 9');
      expect(info.platform, DevicePlatform.android);
      expect(info.appVersion, '1.2.0');
      expect(info.lastActiveAt, DateTime.utc(2026, 9, 26, 10, 30));
      expect(info.lastActiveAt!.isUtc, isTrue);
      expect(info.createdAt, DateTime.utc(2026, 9));
      expect(info.isCurrent, isTrue);
    });

    test('unknown platform, blank name, bad dates degrade gracefully', () {
      final info = DeviceSessionMapper.toDomain(
        const DeviceSession(
          sessionId: 's2',
          deviceId: null,
          deviceName: '  ',
          platform: 'symbian',
          appVersion: null,
          lastUsedAt: 'not-a-date',
          createdAt: 'garbage',
          isCurrent: false,
        ),
      );
      expect(info.platform, DevicePlatform.unknown);
      expect(info.hasName, isFalse);
      expect(info.lastActiveAt, isNull);
      expect(
          info.createdAt, DateTime.fromMillisecondsSinceEpoch(0, isUtc: true));
    });
  });

  group('ActiveDevicesRepositoryImpl (wire)', () {
    Map<String, dynamic> row(String id) => {
          'sessionId': id,
          'deviceId': null,
          'deviceName': 'Device $id',
          'platform': 'ios',
          'appVersion': null,
          'lastUsedAt': null,
          'createdAt': '2026-09-01T00:00:00.000Z',
          'isCurrent': false,
        };

    late FakeHttpAdapter adapter;
    late ActiveDevicesRepositoryImpl repo;

    setUp(() {
      adapter = FakeHttpAdapter((o) async => ok([row('a')]));
      final dio = Dio(BaseOptions(baseUrl: 'http://api.test/api/v1'))
        ..httpClientAdapter = adapter;
      repo = ActiveDevicesRepositoryImpl(
        ActiveDevicesApiClient(dio),
        StubAuthRepository(),
      );
    });

    test('today\'s API (plain list, no meta) → one page, no cursor', () async {
      final page = await repo.fetchPage();
      expect(page.items.single.sessionId, 'a');
      expect(page.hasMore, isFalse);
      expect(adapter.requests.single.uri.queryParameters, isEmpty);
    });

    test('honours meta.nextCursor and sends ?cursor= for the next page',
        () async {
      adapter.handler = (o) async => jsonBody({
            'data': [row('a'), row('b')],
            'meta': {'nextCursor': 'c-2'},
          });
      final first = await repo.fetchPage();
      expect(first.nextCursor, 'c-2');
      await repo.fetchPage(cursor: first.nextCursor);
      expect(adapter.requests.last.uri.queryParameters['cursor'], 'c-2');
    });

    test('transport failure surfaces as a network ApiException', () async {
      adapter.handler = (o) async => throwConnectionError(o);
      await expectLater(
        repo.fetchPage(),
        throwsA(
            isA<ApiException>().having((e) => e.isNetworkError, 'net', true)),
      );
    });

    test('a malformed body is an error, not a crash', () async {
      adapter.handler = (o) async => jsonBody({'data': 'nope'});
      await expectLater(repo.fetchPage(), throwsA(isA<ApiException>()));
    });
  });

  group('ActiveDevicesController', () {
    late _PagedRepo repo;
    late ProviderContainer container;

    ProviderContainer make() {
      final c = ProviderContainer(
        overrides: [activeDevicesRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(c.dispose);
      // Keep the autoDispose provider alive for the test.
      c.listen(activeDevicesControllerProvider, (_, __) {});
      return c;
    }

    PaginatedList<DeviceSessionInfo> value() =>
        container.read(activeDevicesControllerProvider).value!;

    ActiveDevicesController ctrl() =>
        container.read(activeDevicesControllerProvider.notifier);

    setUp(() {
      repo = _PagedRepo({
        null: CursorPage(
            items: [_session('1', current: true), _session('2')],
            nextCursor: 'c2'),
        'c2': CursorPage(items: [_session('2'), _session('3')]),
      });
      container = make();
    });

    test('loads the first page, then the next one via the cursor', () async {
      await container.read(activeDevicesControllerProvider.future);
      expect(value().items.map((s) => s.sessionId), ['1', '2']);
      expect(value().hasMore, isTrue);

      await ctrl().loadMore();
      expect(repo.requested, [null, 'c2']);
      expect(value().items.map((s) => s.sessionId), ['1', '2', '3'],
          reason: 'overlapping row 2 is not duplicated');
      expect(value().hasMore, isFalse);

      await ctrl().loadMore();
      expect(repo.requested, [null, 'c2'], reason: 'end of list: no call');
    });

    test('exposes loading-more while the next page is in flight', () async {
      await container.read(activeDevicesControllerProvider.future);
      repo.hold = Completer<void>();
      final pending = ctrl().loadMore();
      expect(value().isLoadingMore, isTrue);
      await ctrl().loadMore();
      expect(repo.requested, [null, 'c2'], reason: 'no duplicate request');
      repo.hold!.complete();
      await pending;
      expect(value().isLoadingMore, isFalse);
    });

    test('a failed page keeps the rows, blocks auto-load, retry resumes',
        () async {
      await container.read(activeDevicesControllerProvider.future);
      repo.failNext = _network;
      await ctrl().loadMore();
      expect(value().loadMoreError, _network);
      expect(value().items, hasLength(2));

      await ctrl().loadMore();
      expect(repo.requested, [null, 'c2'], reason: 'no silent retry loop');

      await ctrl().retryLoadMore();
      expect(value().loadMoreError, isNull);
      expect(value().items, hasLength(3));
    });

    test('pull-to-refresh failure keeps the loaded rows and rethrows',
        () async {
      await container.read(activeDevicesControllerProvider.future);
      repo.failNext = _network;
      await expectLater(ctrl().refresh(), throwsA(_network));
      expect(value().items, hasLength(2));
    });

    test('first-load failure → error state; Retry → data', () async {
      repo = _PagedRepo({
        null: CursorPage(items: [_session('1')]),
      })
        ..failNext = _network;
      container = make();
      await expectLater(
        container.read(activeDevicesControllerProvider.future),
        throwsA(_network),
      );
      expect(container.read(activeDevicesControllerProvider).hasError, isTrue);
      await ctrl().refresh();
      expect(value().items.single.sessionId, '1');
    });

    test('revoke ends the session and drops just that row', () async {
      await container.read(activeDevicesControllerProvider.future);
      await ctrl().revoke('2');
      expect(repo.revoked, ['2']);
      expect(value().items.map((s) => s.sessionId), ['1']);
      expect(value().nextCursor, 'c2', reason: 'pagination is preserved');
    });
  });

  group('ActiveDevicesScreen states', () {
    Future<void> pumpScreen(WidgetTester tester, _PagedRepo repo) async {
      await tester.pumpWidget(
        uxApp(
          const ActiveDevicesScreen(),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [activeDevicesRepositoryProvider.overrideWithValue(repo)],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    testWidgets('loading shows skeleton cards, not a spinner', (tester) async {
      final repo = _PagedRepo({
        null: CursorPage(items: [_session('1')])
      })
        ..hold = Completer<void>();
      await pumpScreen(tester, repo);
      expect(find.byType(AppSkeletonCard), findsWidgets);
      repo.hold!.complete();
      await tester.pump();
    });

    testWidgets('rows + end-of-list mark when there are no more pages',
        (tester) async {
      await pumpScreen(
        tester,
        _PagedRepo({
          null:
              CursorPage(items: [_session('1', current: true), _session('2')]),
        }),
      );
      expect(find.text('Device 1'), findsOneWidget);
      expect(find.text('This device'), findsOneWidget);
      await tester.scrollUntilVisible(find.text("That's everything"), 200);
      expect(find.text("That's everything"), findsOneWidget);
    });

    testWidgets('next-page failure shows error + Retry at the list end',
        (tester) async {
      final repo = _PagedRepo({
        null: CursorPage(items: [_session('1')], nextCursor: 'c2'),
        'c2': CursorPage(items: [_session('2')]),
      })
        ..failOnce.add('c2');
      // The short first page triggers the next-page request right away;
      // it fails once.
      await pumpScreen(tester, repo);
      await tester.pump();
      expect(repo.requested, [null, 'c2']);
      expect(find.text("Couldn't load more"), findsOneWidget);
      expect(find.text('Device 1'), findsOneWidget);

      await tester.tap(find.widgetWithText(AppButton, 'Retry'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Device 2'), findsOneWidget);
      expect(find.text("Couldn't load more"), findsNothing);
    });

    testWidgets('empty list shows the empty state', (tester) async {
      await pumpScreen(tester, _PagedRepo({null: const CursorPage(items: [])}));
      expect(find.text('No active sessions'), findsOneWidget);
    });

    testWidgets('offline with nothing loaded → offline state with Retry',
        (tester) async {
      final repo = _PagedRepo({
        null: CursorPage(items: [_session('1')])
      })
        ..failNext = _network;
      await pumpScreen(tester, repo);
      expect(find.text("You're offline"), findsOneWidget);
      await tester.tap(find.widgetWithText(AppButton, 'Retry'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Device 1'), findsOneWidget);
    });

    testWidgets('offline load recovers by itself when back online',
        (tester) async {
      final monitor = FakeNetworkMonitor();
      final repo = _PagedRepo({
        null: CursorPage(items: [_session('1')])
      })
        ..failNext = _network;
      await tester.pumpWidget(
        uxApp(
          const ActiveDevicesScreen(),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            monitor: monitor,
            extra: [activeDevicesRepositoryProvider.overrideWithValue(repo)],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text("You're offline"), findsOneWidget);

      monitor.set(false);
      await tester.pump();
      monitor.set(true); // probe (FakeProbe) confirms → online
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(find.text('Device 1'), findsOneWidget);
      expect(repo.requested, [null, null]);
    });

    testWidgets('server error → error state with Retry', (tester) async {
      final repo = _PagedRepo({
        null: CursorPage(items: [_session('1')])
      })
        ..failNext = const ApiException(code: 'INTERNAL', message: 'x');
      await pumpScreen(tester, repo);
      expect(find.text("Couldn't load your devices"), findsOneWidget);
    });
  });
}
