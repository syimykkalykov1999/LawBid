import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-15: the app reports its own errors to `/crash-reports`
/// (admin → Вылеты): queued on the phone, one report per error and
/// session, sent in a batch, never throws.
void main() {
  late SharedPreferences prefs;
  late FakeHttpAdapter adapter;
  late FlutterExceptionHandler? savedHandler;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    adapter = FakeHttpAdapter((_) async => jsonBody(null, 204));
    savedHandler = FlutterError.onError;
    CrashReporter.install(
      prefs,
      AppEnvironment.forFlavor(AppFlavor.dev),
      dio: Dio()..httpClientAdapter = adapter,
    );
  });

  tearDown(() {
    FlutterError.onError = savedHandler;
  });

  test('an error is queued, sent as a batch, and then forgotten', () async {
    CrashReporter.setRoute('/cases/3f2b1c9e-1111-4222-8333-444455556666');
    CrashReporter.instance!.report(
      StateError('boom'),
      StackTrace.fromString('#0 main (file.dart:10:3)'),
      fatal: true,
    );
    expect(prefs.getString('crash.queue.v1'), contains('boom'));

    await CrashReporter.instance!.flush();

    expect(adapter.requests, hasLength(1));
    final r = adapter.requests.single;
    expect(r.path, endsWith('/crash-reports'));
    final body = jsonDecode(jsonEncode(r.data)) as Map<String, Object?>;
    final first =
        (body['reports']! as List<Object?>).single! as Map<String, Object?>;
    expect(first['message'], contains('boom'));
    expect(first['fatal'], true);
    expect(first['route'], '/cases/:id');
    expect(first['flavor'], 'dev');
    expect(jsonDecode(prefs.getString('crash.queue.v1')!), isEmpty);
  });

  test('one report per request, cut so the body stays under 8 KB', () async {
    CrashReporter.instance!
      ..report(StateError('a'), StackTrace.fromString('x' * 30000))
      ..report(StateError('b'), StackTrace.fromString('y' * 30000));
    await CrashReporter.instance!.flush();

    expect(adapter.requests, hasLength(1));
    expect(jsonEncode(adapter.requests.single.data).length, lessThan(8000));
    expect(jsonDecode(prefs.getString('crash.queue.v1')!), hasLength(1));
  });

  test('the same error in one session is reported once', () async {
    final trace = StackTrace.fromString('#0 f (a.dart:1:1)');
    CrashReporter.instance!
      ..report(StateError('same'), trace)
      ..report(StateError('same'), trace);
    await CrashReporter.instance!.flush();

    final body = jsonDecode(jsonEncode(adapter.requests.single.data))
        as Map<String, Object?>;
    expect(body['reports'], hasLength(1));
  });

  test('a server that is down keeps the queue for the next start', () async {
    adapter.handler = (_) async => throw DioException(
          requestOptions: RequestOptions(path: '/crash-reports'),
          type: DioExceptionType.connectionError,
        );
    CrashReporter.instance!.report(StateError('offline'), null);
    await CrashReporter.instance!.flush();

    expect(prefs.getString('crash.queue.v1'), contains('offline'));
  });

  test('flag crash_reports off: nothing is queued or sent', () async {
    CrashReporter.enabled = false;
    CrashReporter.instance!.report(
      StateError('muted'),
      StackTrace.fromString('#0 main (file.dart:10:3)'),
    );
    await CrashReporter.instance!.flush();
    expect(prefs.getString('crash.queue.v1'), isNull);
    expect(adapter.requests, isEmpty);
    CrashReporter.enabled = true;
  });
}
