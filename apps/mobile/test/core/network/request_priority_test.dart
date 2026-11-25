import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/widgets/lists/load_ahead.dart';
import 'package:lawbid/core/network/request_priority.dart';

import '../../helpers/fake_http_adapter.dart';

/// Holes re-check (25.11, item 21): the app marks every API call user /
/// prefetch / background (`X-Request-Priority`) so the server's load
/// shedding (Netflix) puts off prefetch and background work first. Red on
/// the old app: no call carried the header at all.
void main() {
  late FakeHttpAdapter adapter;
  late Dio dio;

  setUp(() {
    RequestPriority.lastConfig = null;
    adapter = FakeHttpAdapter((_) async => jsonBody({'data': null}));
    dio = Dio(BaseOptions(baseUrl: 'https://api.example.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(RequestPriorityInterceptor());
  });

  String? sent([int i = 0]) =>
      adapter.requests[i].headers[RequestPriority.header] as String?;

  test('a plain call is what a person waits for: user', () async {
    await dio.get<void>('/feed');
    expect(sent(), 'user');
  });

  test('a list page asked ahead of the finger (LoadAheadGate) is prefetch',
      () async {
    final gate = LoadAheadGate();
    Future<void>? call;
    gate.ask(20, () => call = dio.get<void>('/feed?cursor=abc'));
    await call;
    expect(sent(), 'prefetch');
    // The next call outside the gate is a person's again.
    await dio.get<void>('/feed');
    expect(sent(1), 'user');
  });

  test('background work keeps its mark across awaits', () async {
    await RequestPriority.run(RequestPriority.background, () async {
      await Future<void>.delayed(Duration.zero);
      await dio.get<void>('/contacts/status');
      await dio.post<void>('/contacts/match');
    });
    expect(sent(), 'background');
    expect(sent(1), 'background');
  });

  test("a call's own priority wins over the zone", () async {
    await RequestPriority.run(RequestPriority.prefetch, () async {
      await dio.get<void>('/x', options: RequestPriority.user.options());
    });
    expect(sent(), 'user');
  });

  test('only the three known values are ever sent (never critical)', () {
    expect(
      RequestPriority.values.map((p) => p.wire),
      ['user', 'prefetch', 'background'],
    );
  });

  test('the admin switch off: no mark at all', () async {
    RequestPriority.lastConfig = {'client.request_priority_enabled': 'false'};
    await dio.get<void>('/feed');
    expect(sent(), isNull);
  });

  // Phones send it before any bootstrap; the website only once the server
  // says it allows it (tests run as a phone build, kIsWeb false).
  test('phones send it before any bootstrap; off means never', () {
    expect(RequestPriority.allowed(null), isTrue);
    expect(RequestPriority.allowed(const {}), isTrue);
    const off = {'client.request_priority_enabled': 'false'};
    expect(RequestPriority.allowed(off), isFalse);
  });
}
