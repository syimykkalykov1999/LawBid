import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/notifications/application/push_registrar.dart';

void main() {
  final t0 = DateTime(2026, 10, 25);

  test('a failed registration is retried with backoff until it works',
      () async {
    var sends = 0;
    final waits = <Duration>[];
    int? stamp;
    final r = PushRegistrar(
      send: (t) async {
        if (++sends < 3) throw StateError('offline');
      },
      readLastRegisteredMs: () async => stamp,
      writeLastRegisteredMs: (ms) async => stamp = ms,
      now: () => t0,
      sleep: (d) async => waits.add(d),
    );
    await r.register('tok');
    expect(sends, 3);
    expect(waits, [const Duration(seconds: 5), const Duration(seconds: 30)]);
    expect(stamp, t0.millisecondsSinceEpoch);
  });

  test(
      'a refusal the request can never pass (400 from an older server) is '
      'not retried', () async {
    // Owner 2026-10-28: 16 refused calls in 15 minutes were seen in prod.
    var sends = 0;
    final waits = <Duration>[];
    final r = PushRegistrar(
      send: (t) async {
        sends++;
        throw const ApiException(
          code: ApiErrorCodes.validationError,
          message: 'property actorStyle should not exist',
          statusCode: 400,
        );
      },
      readLastRegisteredMs: () async => null,
      writeLastRegisteredMs: (_) async {},
      sleep: (d) async => waits.add(d),
    );
    await r.register('tok');
    expect(sends, 1);
    expect(waits, isEmpty);
    // 429 / 5xx / offline still retry.
    expect(
      PushRegistrar.isPermanentRefusal(
        const ApiException(code: 'RATE_LIMITED', message: '', statusCode: 429),
      ),
      isFalse,
    );
    expect(
      PushRegistrar.isPermanentRefusal(
        const ApiException(code: 'X', message: '', statusCode: 503),
      ),
      isFalse,
    );
  });

  test('a newer token ends the older retry loop', () async {
    final sent = <String>[];
    late PushRegistrar r;
    var first = true;
    r = PushRegistrar(
      send: (t) async {
        sent.add(t);
        if (t == 'old') throw StateError('offline');
      },
      readLastRegisteredMs: () async => null,
      writeLastRegisteredMs: (_) async {},
      sleep: (d) async {
        if (first) {
          first = false;
          await r.register('new');
        }
      },
    );
    await r.register('old');
    expect(sent, ['old', 'new']);
  });

  test('resume re-registers only after 7 days', () async {
    var sends = 0;
    int? stamp = t0.millisecondsSinceEpoch;
    var now = t0.add(const Duration(days: 6));
    final r = PushRegistrar(
      send: (t) async => sends++,
      readLastRegisteredMs: () async => stamp,
      writeLastRegisteredMs: (ms) async => stamp = ms,
      currentToken: () async => 'fresh',
      now: () => now,
    );
    await r.register('first'); // sends=1 (stamp = day 6)
    sends = 0;
    await r.onResume();
    expect(sends, 0);
    now = now.add(const Duration(days: 7));
    await r.onResume();
    expect(sends, 1);
    expect(r.token, 'fresh');
  });

  test('stop ends everything', () async {
    var sends = 0;
    final r = PushRegistrar(
      send: (t) async => sends++,
      readLastRegisteredMs: () async => null,
      writeLastRegisteredMs: (_) async {},
    )..stop();
    await r.register('x');
    await r.onResume();
    expect(sends, 0);
  });
}
