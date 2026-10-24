import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-23 (web pass): on the web only the public reference
/// answers reach the persistent store; accounts' answers stay in memory.
void main() {
  test('which keys count as public reference data', () {
    const base = 'https://api.test/api/v1';
    for (final path in [
      '/i18n/languages',
      '/i18n/bundle/ru?since=3',
      '/countries',
      '/config/bootstrap',
    ]) {
      expect(isPublicReferenceKey('anon|ru|$base$path'), isTrue, reason: path);
    }
    // Signed in, or any other route: never.
    expect(
      isPublicReferenceKey('user-1|ru|$base/i18n/languages'),
      isFalse,
    );
    expect(isPublicReferenceKey('anon|ru|$base/me/session'), isFalse);
    expect(isPublicReferenceKey('anon|ru|$base/countries/waitlist'), isFalse);
    expect(isPublicReferenceKey('garbage'), isFalse);
  });

  test('public answers go to the persistent store, the rest to memory',
      () async {
    final persistent = CacheDatabase(NativeDatabase.memory());
    final volatile = CacheDatabase(NativeDatabase.memory());
    addTearDown(persistent.close);
    addTearDown(volatile.close);
    final adapter = FakeHttpAdapter((o) async {
      return ResponseBody.fromString(
        jsonEncode({'data': o.path}),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
          'etag': ['W/"v1"'],
        },
      );
    });
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(
        HttpCacheInterceptor(
          disk: PublicRoutedHttpCacheStore(
            public: DriftHttpCacheStore(persistent, () => 1 << 20),
            private: DriftHttpCacheStore(volatile, () => 1 << 20),
          ),
        ),
      );
    await dio.get<dynamic>('/countries');
    await dio.get<dynamic>('/me/session');
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(
      await persistent.httpEntry('anon|null|https://api.test/countries'),
      isNotNull,
    );
    expect(
      await persistent.httpEntry('anon|null|https://api.test/me/session'),
      isNull,
    );
    expect(
      await volatile.httpEntry('anon|null|https://api.test/me/session'),
      isNotNull,
    );
    expect(
      await volatile.httpEntry('anon|null|https://api.test/countries'),
      isNull,
    );
  });
}
