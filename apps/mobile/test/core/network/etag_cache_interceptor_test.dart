import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/etag_cache_interceptor.dart';

/// Answers from a script and records what each request carried.
class _Server implements HttpClientAdapter {
  final seen = <RequestOptions>[];
  int version = 1;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    seen.add(options);
    final tag = 'W/"v$version"';
    if (options.headers['If-None-Match'] == tag) {
      return ResponseBody.fromString('', 304, headers: {
        'etag': [tag],
      });
    }
    return ResponseBody.fromString(
      jsonEncode({'data': 'answer-v$version'}),
      200,
      headers: {
        'content-type': ['application/json'],
        'etag': [tag],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class _Fails implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async =>
      ResponseBody.fromString('{}', 500);

  @override
  void close({bool force = false}) {}
}

String _jwt(String sub) {
  String part(Map<String, Object?> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${part({'alg': 'none'})}.${part({'sub': sub})}.sig';
}

void main() {
  late _Server server;
  late EtagCacheInterceptor cache;
  late Dio dio;

  setUp(() {
    server = _Server();
    cache = EtagCacheInterceptor(maxEntries: 2);
    dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = server
      ..interceptors.add(cache);
  });

  Future<Response<dynamic>> get(
    String path, {
    String user = 'u1',
    String lang = 'en',
  }) =>
      dio.get<dynamic>(
        path,
        options: Options(headers: {
          'Authorization': 'Bearer ${_jwt(user)}',
          'Accept-Language': lang,
        }),
      );

  test('the second identical GET sends If-None-Match and gets the same data',
      () async {
    final first = await get('/feed');
    final second = await get('/feed');
    expect(server.seen[0].headers['If-None-Match'], isNull);
    expect(server.seen[1].headers['If-None-Match'], 'W/"v1"');
    expect(second.statusCode, 200);
    expect(second.data, first.data);
  });

  test('a changed answer replaces the remembered one', () async {
    await get('/feed');
    server.version = 2;
    final changed = await get('/feed');
    expect((changed.data as Map)['data'], 'answer-v2');
    final again = await get('/feed');
    expect(server.seen.last.headers['If-None-Match'], 'W/"v2"');
    expect((again.data as Map)['data'], 'answer-v2');
  });

  test("another user or language never gets someone else's answer", () async {
    await get('/feed');
    await get('/feed', user: 'u2');
    await get('/feed', lang: 'ru');
    expect(server.seen[1].headers['If-None-Match'], isNull);
    expect(server.seen[2].headers['If-None-Match'], isNull);
  });

  test('only GETs are remembered', () async {
    await dio.post<dynamic>('/cases', data: {'a': 1});
    expect(cache.length, 0);
  });

  test('it is bounded: the least recently used entry goes first', () async {
    await get('/a');
    await get('/b');
    await get('/c'); // evicts /a
    expect(cache.length, 2);
    await get('/a');
    expect(server.seen.last.headers['If-None-Match'], isNull);
  });

  test('an error that is not a 304 passes through', () async {
    dio.httpClientAdapter = _Fails();
    expect(() => get('/feed'), throwsA(isA<DioException>()));
  });
}
