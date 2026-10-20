import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/diagnostics/sentry_reporter.dart';

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString('{}', 200);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  const dsn = 'https://abc123@o1.ingest.sentry.io/456';

  late _Adapter adapter;

  setUp(() {
    adapter = _Adapter();
    SentryReporter.debugReset(dio: Dio()..httpClientAdapter = adapter, release: true);
  });

  test('sends one envelope to the project endpoint with no personal data', () async {
    SentryReporter.configure(dsn, AppFlavor.prod);
    SentryReporter.capture(
      StateError('bad for jane@firm.com +1 415 555 2680'),
      StackTrace.fromString('#0      Foo.bar (package:lawbid/a.dart:12:3)'),
      route: '/chat/:id',
    );
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(adapter.requests, hasLength(1));
    final r = adapter.requests.single;
    expect(r.uri.toString(), 'https://o1.ingest.sentry.io/api/456/envelope/');
    expect(r.headers['X-Sentry-Auth'], contains('sentry_key=abc123'));
    final body = r.data as String;
    expect(body, isNot(contains('jane@firm.com')));
    expect(body, isNot(contains('555')));
    final event = jsonDecode(body.split('\n')[2]) as Map<String, dynamic>;
    expect(event['level'], 'error');
    expect(event.containsKey('user'), isFalse);
  });

  test('waits for the DSN, drops everything when none arrives', () async {
    SentryReporter.capture(StateError('early'), null);
    SentryReporter.configure('', AppFlavor.prod);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(adapter.requests, isEmpty);
  });

  test('sends what was waiting once the DSN arrives', () async {
    SentryReporter.capture(StateError('early'), null);
    SentryReporter.configure(dsn, AppFlavor.prod);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(adapter.requests, hasLength(1));
  });

  test('dev flavor and debug builds never report', () async {
    SentryReporter.configure(dsn, AppFlavor.dev);
    SentryReporter.capture(StateError('x'), null);
    SentryReporter.debugReset(dio: Dio()..httpClientAdapter = adapter, release: false);
    SentryReporter.configure(dsn, AppFlavor.prod);
    SentryReporter.capture(StateError('y'), null);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(adapter.requests, isEmpty);
  });

  test('scrubs a network error down to kind, status and path', () {
    final e = DioException(
      requestOptions: RequestOptions(path: '/users/me', method: 'GET'),
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: RequestOptions(path: '/users/me'),
        statusCode: 500,
        data: {'phone': '+14155552680'},
      ),
    );
    expect(
      SentryReporter.scrubMessage(e),
      'DioException(badResponse) 500 GET /users/me',
    );
    expect(
      SentryReporter.scrubMessage('GET https://a.b/x?token=1 failed'),
      'GET https://a.b/x failed',
    );
  });

  test('parses Dart stack frames, newest last', () {
    final f = SentryReporter.frames(
      '#0      A.a (package:lawbid/a.dart:1:2)\n'
      '#1      B.b (package:flutter/b.dart:3:4)',
    );
    expect(f.first['filename'], 'package:flutter/b.dart');
    expect(f.last['in_app'], isTrue);
  });
}
