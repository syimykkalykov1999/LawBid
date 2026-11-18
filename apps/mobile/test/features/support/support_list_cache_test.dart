import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/features/support/data/support_repository.dart';

import '../../helpers/fake_http_adapter.dart';

/// Verify 18.11 (SU3): the ticket list keeps an hour-long phone copy, but
/// my own change (new ticket, reply, close) and pull to refresh make the
/// next read ask the server again — the new ticket was missing for an hour.
void main() {
  late FakeHttpAdapter adapter;
  late Dio dio;
  var version = 1;

  Map<String, dynamic> row(String id) => {
        'id': id,
        'subject': 'Cannot pay',
        'category': 'billing',
        'status': 'open',
        'unread': false,
        'lastMessageAt': '2026-11-18T10:00:00.000Z',
        'createdAt': '2026-11-18T10:00:00.000Z',
        'resolvedAt': null,
        'canReply': true,
      };

  int listReads() =>
      adapter.requests.where((r) => r.path == '/support/tickets').length;

  setUp(() {
    version = 1;
    adapter = FakeHttpAdapter((o) async {
      if (o.path == '/support/tickets') {
        final etag = 'W/"v$version"';
        if (o.headers['If-None-Match'] == etag) {
          return ResponseBody.fromString('', 304, headers: {
            'etag': [etag],
          });
        }
        return ResponseBody.fromString(
          jsonEncode({
            'data': [for (var i = 1; i <= version; i++) row('t$i')],
            'meta': {'nextCursor': null},
          }),
          200,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
            'etag': [etag],
          },
        );
      }
      // POST /support/tickets/:id/close
      version++;
      return ok(row('t1'));
    });
    dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(HttpCacheInterceptor());
  });

  test('a second open inside the hour is served from the phone', () async {
    final repo = SupportRepository(dio);
    await repo.tickets();
    await repo.tickets();
    expect(listReads(), 1);
  });

  test('after my close the list asks the server and shows the change',
      () async {
    final repo = SupportRepository(dio);
    expect(await repo.tickets(), hasLength(1));
    await repo.close('t1');
    final after = await repo.tickets();
    expect(listReads(), 2);
    expect(after, hasLength(2));
  });

  test('pull to refresh asks the server again', () async {
    final repo = SupportRepository(dio);
    await repo.tickets();
    repo.askAgain();
    await repo.tickets();
    expect(listReads(), 2);
  });
}
