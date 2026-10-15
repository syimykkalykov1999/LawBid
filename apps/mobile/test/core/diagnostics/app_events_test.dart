import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-15: usage events are queued on the phone and sent to
/// `/app-events` in batches: at 20 events, on a timer, and when the app
/// goes to the background. A flag switches them off.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedPreferences prefs;
  late FakeHttpAdapter adapter;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    adapter = FakeHttpAdapter((_) async => jsonBody(null, 204));
    AppEvents.enabled = true;
    AppEvents.install(
      prefs,
      AppEnvironment.forFlavor(AppFlavor.dev),
      dio: Dio()..httpClientAdapter = adapter,
    );
  });

  List<Map<String, Object?>> sent() => [
        for (final r in adapter.requests)
          for (final e in (jsonDecode(jsonEncode(r.data))
              as Map<String, Object?>)['events']! as List<Object?>)
            Map<String, Object?>.from(e! as Map),
      ];

  test('screens are normalised: ids and queries out, repeats once', () {
    expect(
      AppEvents.normalizeRoute(
        '/cases/3f2b1c9e-1111-4222-8333-444455556666?tab=2',
      ),
      '/cases/:id',
    );
    expect(AppEvents.normalizeRoute('/post/42/comments'), '/post/:id/comments');
  });

  test('events wait in the queue, then go out in one batch', () async {
    AppEvents.screen('/feed');
    AppEvents.screen('/feed'); // the same screen twice counts once
    AppEvents.screen('/cases/3f2b1c9e-1111-4222-8333-444455556666');
    AppEvents.track('case_created');
    expect(adapter.requests, isEmpty);
    expect(prefs.getString('events.queue.v1'), contains('case_created'));

    await AppEvents.instance!.flush();

    expect(adapter.requests, hasLength(1));
    expect(adapter.requests.single.path, endsWith('/app-events'));
    final events = sent();
    expect(events.map((e) => e['name']), [
      'app_open',
      'screen_view',
      'screen_view',
      'case_created',
    ]);
    expect(events[2]['screen'], '/cases/:id');
    expect(jsonDecode(prefs.getString('events.queue.v1')!), isEmpty);
  });

  test('20 events send themselves', () async {
    for (var i = 0; i < 19; i++) {
      AppEvents.track('tap');
    }
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(adapter.requests, hasLength(1));
    expect(sent(), hasLength(20));
  });

  test('a failed send keeps the events for the next try', () async {
    adapter = FakeHttpAdapter((_) async => jsonBody(null, 500));
    AppEvents.install(
      prefs,
      AppEnvironment.forFlavor(AppFlavor.dev),
      dio: Dio()..httpClientAdapter = adapter,
    );
    AppEvents.track('tap');
    await AppEvents.instance!.flush();
    expect(prefs.getString('events.queue.v1'), contains('tap'));
  });

  test('flag off: nothing is queued or sent', () async {
    AppEvents.enabled = false;
    AppEvents.track('tap');
    AppEvents.screen('/feed');
    await AppEvents.instance!.flush();
    expect(adapter.requests, isEmpty);
    AppEvents.enabled = true;
  });
}
