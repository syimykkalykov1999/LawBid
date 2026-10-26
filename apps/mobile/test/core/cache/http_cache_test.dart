import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/network_usage.dart';

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
      {'cache.limit_mb.http': '32', 'cache.keep_media_days.default': '30'},
      userMb: {CacheStore.http: 64, CacheStore.images: 100},
      userKeepMediaDays: 7,
    );
    expect(l.limitMb(CacheStore.http), 32);
    expect(l.limitMb(CacheStore.images), 100);
    expect(l.limitMb(CacheStore.video), 1000);
    expect(l.keepMediaDays, 7);
    expect(l.keepMedia, KeepMedia.week);
    expect(
      CacheLimits.fromAppConfig(const {}, userKeepMediaDays: 0).keepMediaDays,
      30,
    );
    expect(
      CacheLimits.fromAppConfig(
        const {'cache.keep_media_days.default': '0'},
        userKeepMediaDays: 0,
      ).keepMedia,
      KeepMedia.always,
    );
  });
}
