import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';
import 'package:lawbid/core/diagnostics/sentry_native.dart';
import 'package:lawbid/core/diagnostics/sentry_reporter.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';

class _FakeSdk implements SentryNativeSdk {
  final inits = <String>[];
  int closes = 0;
  final captured = <({Object error, bool fatal, String? route})>[];

  @override
  Future<void> init(
    String dsn, {
    required String release,
    required String dist,
  }) async =>
      inits.add(dsn);

  @override
  Future<void> close() async => closes++;

  @override
  Future<void> capture(
    Object error,
    StackTrace? stack, {
    required bool fatal,
    String? route,
  }) async =>
      captured.add((error: error, fatal: fatal, route: route));
}

class _Envelopes implements HttpClientAdapter {
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

/// Owner 2026-10-22 (audit #11): Sentry's native SDK catches native crashes
/// and ANRs on a prod release phone; Dart errors from CrashReporter go
/// through it, and our own server still gets them as before.
void main() {
  const dsn = 'https://abc123@o1.ingest.sentry.io/456';

  late _FakeSdk sdk;
  late _Envelopes envelopes;
  late SharedPreferences prefs;
  late FakeHttpAdapter server;
  late FlutterExceptionHandler? savedHandler;

  setUp(() async {
    sdk = _FakeSdk();
    envelopes = _Envelopes();
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    server = FakeHttpAdapter((_) async => jsonBody(null, 204));
    savedHandler = FlutterError.onError;
    SentryNative.debugReset(sdk: sdk, release: true, supported: true);
    SentryReporter.debugReset(
      dio: Dio()..httpClientAdapter = envelopes,
      release: true,
    );
  });

  tearDown(() {
    FlutterError.onError = savedHandler;
    SentryNative.debugReset();
    SentryReporter.debugReset();
  });

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 20));

  void install(AppFlavor flavor) => CrashReporter.install(
        prefs,
        AppEnvironment.forFlavor(flavor),
        dio: Dio()..httpClientAdapter = server,
      );

  test(
      'prod: the bootstrap DSN starts the SDK; Dart errors go through it '
      'and still reach our server', () async {
    install(AppFlavor.prod);
    await SentryNative.start(prefs, AppFlavor.prod);
    expect(sdk.inits, isEmpty); // nothing saved yet

    SentryReporter.configure(dsn, AppFlavor.prod);
    await settle();
    expect(sdk.inits, [dsn]);
    expect(SentryNative.running, isTrue);

    CrashReporter.setRoute('/cases/3f2b1c9e-1111-4222-8333-444455556666');
    CrashReporter.instance!.report(StateError('boom'), null, fatal: true);
    await settle();
    expect(sdk.captured, hasLength(1));
    expect(sdk.captured.single.fatal, isTrue);
    expect(sdk.captured.single.route, '/cases/:id');
    expect(envelopes.requests, isEmpty, reason: 'sent once, not twice');

    await CrashReporter.instance!.flush();
    expect(server.requests, hasLength(1));
    expect(jsonEncode(server.requests.single.data), contains('boom'));
  });

  test('the next start watches from the first second with the saved DSN',
      () async {
    await SentryNative.start(prefs, AppFlavor.prod);
    await SentryNative.configure(dsn, AppFlavor.prod);
    SentryNative.debugReset(sdk: sdk, release: true, supported: true);
    sdk.inits.clear();

    await SentryNative.start(prefs, AppFlavor.prod);
    expect(sdk.inits, [dsn]);
  });

  test('an emptied DSN stops the SDK and forgets it', () async {
    await SentryNative.start(prefs, AppFlavor.prod);
    await SentryNative.configure(dsn, AppFlavor.prod);
    await SentryNative.configure('', AppFlavor.prod);
    expect(sdk.closes, 1);
    expect(SentryNative.running, isFalse);
    expect(prefs.getString('sentry.native_dsn.v1'), isNull);
  });

  test('dev, staging and debug builds never start it', () async {
    for (final flavor in [AppFlavor.dev, AppFlavor.staging]) {
      await SentryNative.start(prefs, flavor);
      await SentryNative.configure(dsn, flavor);
    }
    SentryNative.debugReset(sdk: sdk, release: false, supported: true);
    await SentryNative.start(prefs, AppFlavor.prod);
    await SentryNative.configure(dsn, AppFlavor.prod);
    expect(sdk.inits, isEmpty);
    expect(SentryNative.running, isFalse);
  });

  test('events are scrubbed: no user, no e-mail or phone in the text', () {
    final event = SentryEvent(
      user: SentryUser(id: 'u1', email: 'jane@firm.com'),
      exceptions: [
        SentryException(
          type: 'StateError',
          value: 'bad for jane@firm.com +1 415 555 2680',
        ),
      ],
    );
    final out = SentryNative.scrub(event);
    expect(out.user, isNull);
    expect(out.exceptions!.single.value, isNot(contains('jane@firm.com')));
    expect(out.exceptions!.single.value, isNot(contains('555')));
  });

  group('compiled-in DSN (S15-11)', () {
    const compiled = 'https://pub@o1.ingest.sentry.io/999';

    setUp(
      () => SentryNative.debugReset(
        sdk: sdk,
        release: true,
        supported: true,
        compiledDsn: compiled,
      ),
    );

    test('the very first launch already watches, with no bootstrap yet',
        () async {
      await SentryNative.start(prefs, AppFlavor.prod);
      expect(sdk.inits, [compiled]);
      expect(SentryNative.running, isTrue);
    });

    test('the admin value overrides it, and an emptied one falls back',
        () async {
      await SentryNative.start(prefs, AppFlavor.prod);
      await SentryNative.configure(dsn, AppFlavor.prod);
      expect(sdk.inits, [compiled, dsn]);
      await SentryNative.configure('', AppFlavor.prod);
      expect(sdk.inits.last, compiled);
      expect(SentryNative.running, isTrue);
      expect(prefs.getString('sentry.native_dsn.v1'), isNull);
    });

    test('a saved admin DSN beats the compiled one at the next start',
        () async {
      await prefs.setString('sentry.native_dsn.v1', dsn);
      await SentryNative.start(prefs, AppFlavor.prod);
      expect(sdk.inits, [dsn]);
    });

    test('dev and staging still never start it', () async {
      await SentryNative.start(prefs, AppFlavor.dev);
      expect(sdk.inits, isEmpty);
    });
  });
}
