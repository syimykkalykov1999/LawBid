import 'dart:math';

import 'package:dio/dio.dart';

import 'package:lawbid/core/network/request_flags.dart';

/// Stamps an `Idempotency-Key` header on every POST that opts in via
/// [RequestFlags.createsResource] (`.cursorrules` backend rule "Все POST,
/// создающие ресурс/деньги: Idempotency-Key"; header name matches
/// apps/api/src/idempotency/idempotency.interceptor.ts).
///
/// The key is generated ONCE per logical request and kept on the
/// [RequestOptions] headers, so a transparent retry (RetryInterceptor or the
/// post-refresh replay in AuthInterceptor) re-sends the SAME key and the
/// server replays the stored response instead of creating a duplicate.
class IdempotencyInterceptor extends Interceptor {
  IdempotencyInterceptor({String Function()? keyFactory})
      : _keyFactory = keyFactory ?? generateIdempotencyKey;

  static const headerName = 'Idempotency-Key';

  final String Function() _keyFactory;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final opted = options.extra[RequestFlags.createsResource] == true;
    final isPost = options.method.toUpperCase() == 'POST';
    final hasKey =
        options.headers.keys.any((k) => k.toLowerCase() == 'idempotency-key');
    if (opted && isPost && !hasKey) {
      options.headers[headerName] = _keyFactory();
    }
    handler.next(options);
  }
}

/// Random v4 UUID (no `uuid` package — same approach as
/// HeadersInterceptor's device id).
String generateIdempotencyKey() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  String hex(int start, int end) => bytes
      .sublist(start, end)
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}
