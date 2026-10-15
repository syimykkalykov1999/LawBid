import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/search/data/search_repository.dart';

import '../../helpers/fake_http_adapter.dart';

/// Owner 2026-10-15: a result opened after a query is reported to
/// `POST /search/clicks` (the search learns "query → topic" from it); it
/// never waits and never fails the screen.
void main() {
  test('opening a case sends the query and the case', () async {
    final adapter = FakeHttpAdapter((_) async => jsonBody(null, 204));
    final repo = ApiSearchRepository(Dio()..httpClientAdapter = adapter);

    repo.opened('  развод с мужем ', SearchOpened.valueCase, 'case-1');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(adapter.requests, hasLength(1));
    final r = adapter.requests.single;
    expect(r.method, 'POST');
    expect(r.path, endsWith('/search/clicks'));
    expect(jsonDecode(jsonEncode(r.data)), {
      'q': 'развод с мужем',
      'targetType': 'case',
      'targetId': 'case-1',
    });
  });

  test('a short query is not worth reporting', () async {
    final adapter = FakeHttpAdapter((_) async => jsonBody(null, 204));
    final repo = ApiSearchRepository(Dio()..httpClientAdapter = adapter);

    repo.opened('ab', SearchOpened.post, 'p1');
    await Future<void>.delayed(const Duration(milliseconds: 20));

    expect(adapter.requests, isEmpty);
  });

  test('a failing server never throws into the screen', () async {
    final adapter = FakeHttpAdapter(
      (_) async => apiError(500, 'INTERNAL_ERROR'),
    );
    final repo = ApiSearchRepository(Dio()..httpClientAdapter = adapter);

    repo.opened('divorce lawyer', SearchOpened.attorney, 'a1');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(adapter.requests, hasLength(1));
  });
}
