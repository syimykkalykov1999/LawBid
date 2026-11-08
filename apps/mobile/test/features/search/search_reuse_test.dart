import 'package:dio/dio.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-11-08 («кэш есть, а не работает»): the same search typed or
/// opened again asks the server nothing for a short while.
class _CountingSearch implements SearchRepository {
  int reads = 0;

  @override
  Future<CursorPage<FeedCase>> cases(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    reads++;
    return const CursorPage(items: []);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

void main() {
  test('type-ahead: «ab», «abc», «ab» again is 2 requests, not 3', () async {
    final adapter = FakeHttpAdapter(
      (o) async => ResponseBody.fromString(
        '{"data":[]}',
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
          'etag': ['"t-${o.uri.query}"'],
        },
      ),
    );
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(HttpCacheInterceptor());
    final repo = ApiSearchRepository(dio);
    await repo.suggest('ab');
    await repo.suggest('abc');
    await repo.suggest('ab');
    await repo.tags('ab');
    await repo.tags('ab');
    expect(
      adapter.requests.map((r) => '${r.path}?${r.uri.query}'),
      ['/search/suggest?q=ab', '/search/suggest?q=abc', '/search/tags?q=ab'],
    );
  });

  test('the same search again within 2 min reads nothing; after, reads once',
      () {
    fakeAsync((async) {
      final repo = _CountingSearch();
      final c = ProviderContainer(
        overrides: [
          searchRepositoryProvider.overrideWithValue(repo),
          isGuestProvider.overrideWithValue(false),
        ],
      );
      addTearDown(c.dispose);
      const key = (q: 'divorce', filters: SearchFilters());
      void visit() => c.listen(caseSearchProvider(key), (_, __) {}).close();

      visit();
      async.flushMicrotasks();
      for (var i = 0; i < 3; i++) {
        async.elapse(const Duration(seconds: 30));
        visit();
        async.flushMicrotasks();
      }
      expect(repo.reads, 1);

      async.elapse(kSearchResultsWindow + const Duration(seconds: 1));
      visit();
      async.flushMicrotasks();
      expect(repo.reads, 2);
    });
  });
}
