import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/network_usage.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-22 (client economy plan, package D): the HTTP cache lives
/// on disk too — a new process gets a 304 instead of the body; a GET
/// allowed to be [cachedFor] a while is served with no request at all.
void main() {
  late CacheDatabase db;
  late FakeHttpAdapter adapter;
  var etag = 'W/"v1"';
  var body = {'data': 'one'};
  var now = DateTime(2026, 10, 22, 12);

  Dio build({NetworkUsageCounter? usage}) {
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter;
    dio.interceptors.add(
      HttpCacheInterceptor(
        disk: DriftHttpCacheStore(db, () => 32 * 1024 * 1024),
        usage: usage,
        now: () => now,
      ),
    );
    return dio;
  }

  setUp(() {
    db = CacheDatabase(NativeDatabase.memory());
    adapter = FakeHttpAdapter((o) async {
      if (o.headers['If-None-Match'] == etag) {
        return ResponseBody.fromString(
          '',
          304,
          headers: {
            'etag': [etag],
          },
        );
      }
      return ResponseBody.fromString(
        jsonEncode(body),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
          'etag': [etag],
        },
      );
    });
  });
  tearDown(() => db.close());

  test('a new process asks with If-None-Match and gets the body back on 304',
      () async {
    final usage = NetworkUsageCounter();
    final first = build(usage: usage);
    final r1 = await first.get<Map<String, dynamic>>('/config/bootstrap');
    expect(r1.data, body);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(await db.httpBytes(), greaterThan(0));

    // «Restart»: a fresh interceptor with an empty memory, the same disk.
    final second = build(usage: usage);
    final r2 = await second.get<Map<String, dynamic>>('/config/bootstrap');
    expect(adapter.requests.last.headers['If-None-Match'], etag);
    expect(r2.data, body);
    expect(r2.extra[kFromCacheExtra], true);
    expect(usage.value.notModified, 1);
    expect(usage.value.requests, 2);
  });

  test('mustAskAgain ends the cachedFor window for that path only', () async {
    final dio = build();
    final cache = dio.interceptors.whereType<HttpCacheInterceptor>().single;
    final hour = cachedFor(const Duration(hours: 1));
    await dio.get<dynamic>('/attorneys/jane.doe', options: hour);
    await dio.get<dynamic>('/attorneys/other', options: hour);
    final before = adapter.requests.length;

    await dio.get<dynamic>('/attorneys/jane.doe', options: hour);
    expect(adapter.requests.length, before, reason: 'still fresh');

    // Any case: the link may spell the handle differently.
    cache.mustAskAgain('/attorneys/Jane.Doe');
    etag = 'W/"v2"';
    body = {'data': 'two'};
    final fresh = await dio.get<dynamic>(
      '/attorneys/jane.doe',
      options: hour,
    );
    expect(adapter.requests.length, before + 1);
    expect(adapter.requests.last.headers['If-None-Match'], 'W/"v1"');
    expect((fresh.data as Map)['data'], 'two');

    await dio.get<dynamic>('/attorneys/other', options: hour);
    expect(adapter.requests.length, before + 1, reason: 'other is untouched');
  });

  test('cachedFor serves the copy with no request while it is fresh', () async {
    final usage = NetworkUsageCounter();
    final dio = build(usage: usage);
    await dio.get<dynamic>(
      '/pricing',
      options: cachedFor(const Duration(hours: 1)),
    );
    now = now.add(const Duration(minutes: 10));
    final r = await dio.get<dynamic>(
      '/pricing',
      options: cachedFor(const Duration(hours: 1)),
    );
    expect(adapter.requests.length, 1);
    expect(r.data, body);
    expect(usage.value.servedLocally, 1);

    // Stale: the server is asked (and answers 304 for free).
    now = now.add(const Duration(hours: 2));
    await dio.get<dynamic>(
      '/pricing',
      options: cachedFor(const Duration(hours: 1)),
    );
    expect(adapter.requests.length, 2);
    expect(usage.value.notModified, 1);

    // A 304 counts as «confirmed now»: fresh again for another hour.
    now = now.add(const Duration(minutes: 30));
    await dio.get<dynamic>(
      '/pricing',
      options: cachedFor(const Duration(hours: 1)),
    );
    expect(adapter.requests.length, 2);
  });

  test('readFromPhoneOnly: the copy is served with no request, any age',
      () async {
    final dio = build();
    await dio.get<dynamic>('/cases/mine');
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final before = adapter.requests.length;
    now = now.add(const Duration(days: 3));

    // A new process (empty memory): the disk copy answers.
    final restarted = build();
    final r = (await readFromPhoneOnly(
      () => restarted.get<Map<String, dynamic>>('/cases/mine'),
    ))!;
    expect(r.data, body);
    expect(r.extra[kFromCacheExtra], true);
    expect(adapter.requests.length, before, reason: 'no request at all');
  });

  test('readFromPhoneOnly asUser: the copy of that account only (row 127)',
      () async {
    String bearer(String sub) {
      String enc(Map<String, Object?> m) =>
          base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
      return 'Bearer ${enc({'alg': 'none'})}.${enc({'sub': sub})}.sig';
    }

    final dio = build();
    await dio.get<dynamic>(
      '/me/session',
      options: Options(headers: {'Authorization': bearer('u1')}),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final before = adapter.requests.length;
    final restarted = build();
    // The cached cold start: no bearer yet, the account from the claims.
    final r = (await readFromPhoneOnly(
      () => restarted.get<Map<String, dynamic>>('/me/session'),
      asUser: 'u1',
    ))!;
    expect(r.data, body);
    await expectLater(
      readFromPhoneOnly(
        () => restarted.get<dynamic>('/me/session'),
        asUser: 'u2',
      ),
      throwsA(isA<DioException>()),
    );
    // Without asUser it is a guest's key: no copy either.
    await expectLater(
      readFromPhoneOnly(() => restarted.get<dynamic>('/me/session')),
      throwsA(isA<DioException>()),
    );
    expect(adapter.requests.length, before, reason: 'no request at all');
  });

  test('readFromPhoneOnly: no copy fails without touching the network',
      () async {
    final dio = build();
    await expectLater(
      readFromPhoneOnly(() => dio.get<dynamic>('/never/seen')),
      throwsA(
        isA<DioException>().having((e) => e.error, 'error', kNoPhoneCopy),
      ),
    );
    expect(adapter.requests, isEmpty);
    // Outside the helper the same GET goes out as before.
    await dio.get<dynamic>('/never/seen');
    expect(adapter.requests, hasLength(1));
  });

  test('the phone-only disk wait stays under the list copy budget', () {
    expect(
      HttpCacheInterceptor().phoneOnlyDiskWait,
      lessThan(PagedNotifier.savedCopyTimeout),
    );
  });

  test('readFromPhoneOnly: a slow disk is a miss before the list gives up',
      () async {
    final slow = _SlowStore(
      const Duration(milliseconds: 300),
      HttpCacheEntry(
        etag: 'e',
        data: body,
        bytes: 10,
        fetchedAt: now,
      ),
    );
    Dio make() => Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(
        HttpCacheInterceptor(
          disk: slow,
          phoneOnlyDiskWait: const Duration(milliseconds: 50),
          now: () => now,
        ),
      );

    final sw = Stopwatch()..start();
    await expectLater(
      readFromPhoneOnly(() => make().get<dynamic>('/slow')),
      throwsA(
        isA<DioException>().having((e) => e.error, 'error', kNoPhoneCopy),
      ),
    );
    expect(sw.elapsedMilliseconds, lessThan(290));
    expect(adapter.requests, isEmpty);

    // The normal path keeps its longer wait and still uses the disk copy.
    final r = await make().get<dynamic>('/slow');
    expect(r.data, body);
    expect(adapter.requests.single.headers['If-None-Match'], 'e');
  });

  test('cold start offline: the phone copy opens the screen, live read fails',
      () async {
    await build().get<dynamic>('/cases/mine');
    for (var i = 0; i < 100 && await db.httpBytes() == 0; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    adapter.handler = (o) async => throwConnectionError(o);
    final restarted = build(); // empty memory, disk only
    final copy = (await readFromPhoneOnly(
      () => restarted.get<Map<String, dynamic>>('/cases/mine'),
    ))!;
    expect(copy.data, body);
    // The refresh that follows is served stale-if-error, never an empty list.
    final live = await restarted.get<dynamic>('/cases/mine');
    expect(live.data, body);
    expect(live.extra[kStaleExtra], true);
  });

  test('stale-if-error: a dead network or 502-504 serves the copy', () async {
    final dio = build();
    final ok1 = await dio.get<dynamic>('/plans');
    expect(ok1.extra[kStaleExtra], isNull);

    // No network at all.
    adapter.handler = (o) async => throwConnectionError(o);
    now = now.add(const Duration(minutes: 5));
    final r1 = await dio.get<dynamic>('/plans');
    expect(r1.data, body);
    expect(r1.extra[kFromCacheExtra], true);
    expect(r1.extra[kStaleExtra], true);

    // Gateway errors too.
    for (final status in [502, 503, 504]) {
      adapter.handler = (o) async => ResponseBody.fromString('', status);
      final r = await dio.get<dynamic>('/plans');
      expect(r.extra[kStaleExtra], true, reason: '$status');
    }

    // A real answer of the server (404 / 500) is never hidden.
    adapter.handler = (o) async => ResponseBody.fromString('', 404);
    await expectLater(
      dio.get<dynamic>('/plans'),
      throwsA(isA<DioException>()),
    );
    adapter.handler = (o) async => ResponseBody.fromString('', 500);
    await expectLater(
      dio.get<dynamic>('/plans'),
      throwsA(isA<DioException>()),
    );
  });

  test('stale-if-error: a copy older than the limit is not served', () async {
    final dio = build();
    await dio.get<dynamic>('/plans');
    adapter.handler = (o) async => throwConnectionError(o);
    now = now.add(const Duration(hours: 9));
    await expectLater(
      dio.get<dynamic>('/plans'),
      throwsA(isA<DioException>()),
    );
  });

  test('stale-if-error: no copy means the error stays', () async {
    final dio = build();
    adapter.handler = (o) async => throwConnectionError(o);
    await expectLater(
      dio.get<dynamic>('/never-seen'),
      throwsA(isA<DioException>()),
    );
  });

  test('a changed body replaces the copy', () async {
    final dio = build();
    await dio.get<dynamic>('/x');
    etag = 'W/"v2"';
    body = {'data': 'two'};
    final r = await dio.get<dynamic>('/x');
    expect(r.data, {'data': 'two'});
    await Future<void>.delayed(const Duration(milliseconds: 20));
    final row = await db.httpEntry('anon|null|https://api.test/x');
    expect(row?.etag, 'W/"v2"');
  });

  test('another account and another language get their own rows', () async {
    final dio = build();
    await dio.get<dynamic>(
      '/me',
      options: Options(headers: {'Accept-Language': 'ru'}),
    );
    await dio.get<dynamic>(
      '/me',
      options: Options(headers: {'Accept-Language': 'en'}),
    );
    expect(adapter.requests.length, 2);
    expect(adapter.requests.last.headers['If-None-Match'], isNull);
  });

  test('clear() empties memory and disk', () async {
    final i = HttpCacheInterceptor(
      disk: DriftHttpCacheStore(db, () => 1 << 20),
      now: () => now,
    );
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(i);
    await dio.get<dynamic>('/a');
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(i.length, 1);
    await i.clear();
    expect(i.length, 0);
    expect(await db.httpBytes(), 0);
  });

  test('the disk store trims least recently used rows past the limit',
      () async {
    for (var i = 0; i < 5; i++) {
      await db.putHttpEntry(
        key: 'k$i',
        etag: 'e',
        json: 'x' * 100,
        bytes: 100,
        now: now.add(Duration(minutes: i)),
      );
    }
    await db.trimHttp(250);
    expect(await db.httpEntry('k0'), isNull);
    expect(await db.httpEntry('k1'), isNull);
    expect(await db.httpEntry('k2'), isNull);
    expect(await db.httpEntry('k4'), isNotNull);
  });

  test('limits: the user may only lower the admin ceiling', () {
    final l = CacheLimits.fromAppConfig(
      {'cache.limit_mb.http': '32'},
      userMb: {CacheStore.http: 64, CacheStore.images: 100},
    );
    expect(l.limitMb(CacheStore.http), 32);
    expect(l.limitMb(CacheStore.images), 100);
    expect(l.limitMb(CacheStore.video), 0, reason: 'no own ceiling');
    // The media stores have no ceiling of their own: the cap rules them.
    expect(l.limitMb(CacheStore.chatMedia), 0);
    expect(
      l.limitBytes(CacheStore.chatMedia),
      CacheLimits.unboundedBytes,
    );
  });

  test('server ceilings of 0 leave the 10 GB cap in charge of the media', () {
    final l = CacheLimits.fromAppConfig(const {
      'cache.limit_mb.images': '0',
      'cache.limit_mb.chat_media': '0',
      'cache.limit_mb.files': '0',
      'cache.limit_mb.video': '0',
    });
    for (final s in [
      CacheStore.images,
      CacheStore.chatMedia,
      CacheStore.files,
      CacheStore.video,
    ]) {
      expect(l.limitBytes(s), CacheLimits.unboundedBytes, reason: s.name);
    }
    expect(l.capBytes, 10 * 1024 * 1024 * 1024);
  });

  test('cap and auto-delete: owner defaults, user choices', () {
    const d = CacheLimits();
    expect(d.capMb, 10 * 1024, reason: 'default 10 GB');
    expect(d.capBytes, 10 * 1024 * 1024 * 1024);
    expect(d.autoDelete(AutoDeleteScope.privateChats), AutoDeleteAge.never);
    expect(d.autoDelete(AutoDeleteScope.groups), AutoDeleteAge.month);
    expect(d.autoDelete(AutoDeleteScope.feed), AutoDeleteAge.week);
    final u = CacheLimits.fromAppConfig(
      const {},
      userCapMb: 0,
      userAutoDeleteDays: {AutoDeleteScope.groups: 3},
    );
    expect(u.capBytes, isNull, reason: '«Нет»');
    expect(u.autoDelete(AutoDeleteScope.groups), AutoDeleteAge.threeDays);
    expect(AutoDeleteAge.fromDays(5), AutoDeleteAge.week);
  });
}

/// A disk that answers [delay] late (a busy phone).
class _SlowStore implements HttpCacheStore {
  _SlowStore(this.delay, this.entry);
  final Duration delay;
  final HttpCacheEntry entry;

  @override
  Future<HttpCacheEntry?> read(String key) async {
    await Future<void>.delayed(delay);
    return entry;
  }

  @override
  Future<void> write(String key, HttpCacheEntry entry, String json) async {}

  @override
  Future<void> touch(
    String key,
    DateTime now, {
    required bool confirmed,
  }) async {}

  @override
  Future<void> clear() async {}
}
