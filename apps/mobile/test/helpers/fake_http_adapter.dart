import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

typedef FakeHandler = Future<ResponseBody> Function(RequestOptions options);

/// In-memory [HttpClientAdapter]: records every request that reaches the
/// wire and answers via [handler]. Lets repository/interceptor tests run
/// against a real [Dio] (real interceptors, real envelopes) with no network.
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter(this.handler);

  FakeHandler handler;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody jsonBody(Object? body, [int status = 200]) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// `{data: ...}` success envelope (docs/01 §7).
ResponseBody ok(Object? data) => jsonBody({'data': data});

/// `{error: {code, message, details}}` error envelope (docs/01 §7).
ResponseBody apiError(int status, String code, [Map<String, dynamic>? details]) => jsonBody(
      {
        'error': {'code': code, 'message': code, if (details != null) 'details': details},
      },
      status,
    );

Never throwConnectionError(RequestOptions o) =>
    throw DioException(requestOptions: o, type: DioExceptionType.connectionError);
