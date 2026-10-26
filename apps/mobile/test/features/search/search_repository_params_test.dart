import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/search/data/search_repository.dart';

/// Records the query of every request and answers an empty page.
class _Recorder implements HttpClientAdapter {
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({
        'data': <Object>[],
        'meta': {'nextCursor': null},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Recorder rec;
  late ApiSearchRepository repo;

  setUp(() {
    rec = _Recorder();
    repo = ApiSearchRepository(Dio()..httpClientAdapter = rec);
  });

  Map<String, dynamic> last() => rec.requests.last.queryParameters;

  test('posts: category goes as `practice` (+ legacy topic tag), with period',
      () async {
    await repo.posts(
      'divorce',
      filters: const SearchFilters(
        practiceCategory: 'family_law',
        state: 'NY',
        period: SearchPeriod.week,
        withPhotos: true,
        postSort: PostSort.popular,
      ),
    );
    expect(rec.requests.last.path, endsWith('/search/posts'));
    expect(last()['q'], 'divorce');
    expect(last()['practice'], 'family_law');
    expect(last()['tag'], 'familylaw');
    expect(last()['state'], 'NY');
    expect(last()['period'], '7d');
    expect(last()['withPhotos'], true);
    expect(last()['sort'], 'popular');
    expect(last().containsKey('briefsOnly'), isFalse);
  });

  test('posts: no filters sends nothing extra', () async {
    await repo.posts('law');
    expect(last().containsKey('practice'), isFalse);
    expect(last().containsKey('tag'), isFalse);
    expect(last().containsKey('state'), isFalse);
  });

  test('people: role, verified, state, practice, rating, language', () async {
    await repo.people(
      'an',
      const SearchFilters(
        role: 'attorney',
        verifiedOnly: true,
        state: 'CA',
        practiceAreaId: '39a5ec8d-b303-4584-b2c8-2e8aa2928d2b',
        minRating: 4,
        language: 'en',
      ),
    );
    expect(rec.requests.last.path, endsWith('/search/people'));
    expect(last()['role'], 'attorney');
    expect(last()['verifiedOnly'], true);
    expect(last()['state'], 'CA');
    expect(last()['practiceAreaId'], '39a5ec8d-b303-4584-b2c8-2e8aa2928d2b');
    expect(last()['minRating'], 4);
    expect(last()['language'], 'en');
    await repo.people('an', const SearchFilters());
    expect(last().containsKey('role'), isFalse);
    expect(last().containsKey('verifiedOnly'), isFalse);
  });

  test('cases: category, budget, clarify later, no bids, urgency, period',
      () async {
    await repo.cases(
      'warehouse',
      const SearchFilters(
        practiceCategory: 'family_law',
        budgetMin: 500,
        budgetMax: 1000,
        budgetUnknown: true,
        noBids: true,
        minUrgency: 'urgent',
        hasDeadline: true,
        period: SearchPeriod.month,
        state: 'NJ',
      ),
    );
    expect(rec.requests.last.path, endsWith('/search/cases'));
    expect(last()['practiceCategory'], 'family_law');
    expect(last()['budgetMin'], 500);
    expect(last()['budgetMax'], 1000);
    expect(last()['budgetUnknown'], true);
    expect(last()['noBids'], true);
    expect(last()['minUrgency'], 'urgent');
    expect(last()['hasDeadline'], true);
    expect(last()['period'], '30d');
    expect(last()['state'], 'NJ');
  });
}
