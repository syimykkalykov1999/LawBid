import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/diagnostics/client_sli.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';

/// Б6 (25.11): the six SLO flows as the person sees them (SRE Workbook
/// ch. 2 «measure close to the user»), counted after the app's retries and
/// sent only as opt-in anonymous usage events.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final counted = <String>[];

  setUp(() {
    ClientTuning.reset();
    counted.clear();
    ClientSli.sink = counted.add;
  });
  tearDown(() => ClientSli.sink = AppEvents.track);

  test('the API calls of the six flows are recognised (ids out)', () {
    expect(ClientSli.flowOf('POST', '/auth/password/login'), SliFlow.login);
    expect(ClientSli.flowOf('post', '/auth/otp/verify'), SliFlow.login);
    expect(ClientSli.flowOf('GET', '/feed?cursor=abc'), SliFlow.feed);
    expect(
      ClientSli.flowOf(
        'POST',
        '/conversations/3f2b1c9e-1111-4222-8333-444455556666/messages',
      ),
      SliFlow.message,
    );
    expect(
      ClientSli.flowOf('POST', 'https://api.lawbid.dev/api/v1/pay/session'),
      SliFlow.pay,
    );
    expect(
      ClientSli.flowOf(
        'POST',
        '/calls/3f2b1c9e-1111-4222-8333-444455556666/accept',
      ),
      SliFlow.call,
    );
    expect(ClientSli.flowOf('GET', '/conversations'), isNull);
    expect(ClientSli.flowOf('POST', '/feed'), isNull);
  });

  test('5xx and timeouts fail; 4xx and an offline phone are not counted', () {
    SliOutcome? o(int? status, DioExceptionType? e, [int ms = 10]) =>
        ClientSliInterceptor.outcomeOf(
          SliFlow.feed,
          status: status,
          error: e,
          elapsed: Duration(milliseconds: ms),
        );
    expect(o(200, null), SliOutcome.ok);
    expect(o(200, null, 4000), SliOutcome.slow); // > client.sli_feed_slow_ms
    expect(o(503, DioExceptionType.badResponse), SliOutcome.fail);
    expect(o(401, DioExceptionType.badResponse), isNull);
    expect(o(null, DioExceptionType.receiveTimeout), SliOutcome.fail);
    expect(o(null, DioExceptionType.connectionError), isNull);
    expect(o(null, DioExceptionType.cancel), isNull);
    expect(
      ClientSliInterceptor.outcomeOf(
        SliFlow.login,
        status: 200,
        error: null,
        elapsed: const Duration(seconds: 30),
      ),
      SliOutcome.ok,
      reason: 'sign-in has no time goal',
    );
  });

  test(
    'the interceptor counts one result per call, after the answer',
    () async {
      final adapter = FakeHttpAdapter(
        (o) async => o.path.endsWith('/messages')
            ? jsonBody({'error': 'x'}, 503)
            : jsonBody({'data': <Object?>[]}),
      );
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example/api/v1'))
        ..httpClientAdapter = adapter
        ..interceptors.add(ClientSliInterceptor());
      await dio.get<void>('/feed');
      await expectLater(
        dio.post<void>('/conversations/abcdef0123456789abcd/messages'),
        throwsA(isA<DioException>()),
      );
      await dio.get<void>('/conversations');
      expect(counted, ['sli_feed_ok', 'sli_message_fail']);
    },
  );

  test('admin switch client.sli_enabled = false: nothing is counted', () {
    ClientTuning.apply({'client.sli_enabled': 'false'});
    ClientSli.record(SliFlow.pay, SliOutcome.fail);
    expect(counted, isEmpty);
    ClientTuning.apply({'client.sli_feed_slow_ms': '1'});
    expect(ClientTuning.sliEnabled, isTrue);
    expect(ClientTuning.sliFeedSlow, const Duration(milliseconds: 500));
  });

  test('every name the flows can give is a listed usage event', () {
    for (final f in SliFlow.values) {
      for (final o in SliOutcome.values) {
        final name = AppEventNames.sli(f, o);
        final hasSlow = f == SliFlow.feed || f == SliFlow.message;
        if (o == SliOutcome.slow && !hasSlow) continue;
        expect(AppEventNames.all, contains(name));
      }
    }
  });

  group('without the usage statistics consent nothing leaves the phone', () {
    late FakeHttpAdapter adapter;
    Future<void> install({required bool? consent}) async {
      SharedPreferences.setMockInitialValues({
        if (consent != null) 'events.consent.v1': consent,
      });
      final prefs = await SharedPreferences.getInstance();
      adapter = FakeHttpAdapter((_) async => jsonBody(null, 204));
      AppEvents.enabled = true;
      AppEvents.install(
        prefs,
        AppEnvironment.forFlavor(AppFlavor.dev),
        dio: Dio()..httpClientAdapter = adapter,
      );
      ClientSli.sink = AppEvents.track;
    }

    List<String> sentNames() => [
          for (final r in adapter.requests)
            for (final e in (jsonDecode(jsonEncode(r.data))
                as Map<String, Object?>)['events']! as List<Object?>)
              '${(e! as Map)['name']}',
        ];

    test('no answer yet: not queued, not sent', () async {
      await install(consent: null);
      ClientSli.record(SliFlow.login, SliOutcome.fail);
      await AppEvents.instance!.flush();
      expect(adapter.requests, isEmpty);
    });

    test('«no»: not sent', () async {
      await install(consent: false);
      ClientSli.record(SliFlow.message, SliOutcome.ok);
      await AppEvents.instance!.flush();
      expect(adapter.requests, isEmpty);
    });

    test('«yes»: the count goes out with the usage events', () async {
      await install(consent: true);
      ClientSli.record(SliFlow.message, SliOutcome.slow);
      await AppEvents.instance!.flush();
      expect(sentNames(), contains('sli_message_slow'));
    });
  });
}
