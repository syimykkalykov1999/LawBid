import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_interceptor.dart';
import 'headers_interceptor.dart';
import 'idempotency_interceptor.dart';
import 'retry_interceptor.dart';

/// The API's base URL. `10.0.2.2` is the Android emulator's alias for the
/// host machine's `localhost` — there is no way for an emulator to reach
/// `localhost` and mean "the host machine"; a physical device or the iOS
/// simulator needs a LAN IP (or a tunnel) instead, not handled here yet.
/// Override at build/run time with
/// `--dart-define=API_BASE_URL=http://<host>:3000/api/v1` for any other
/// target.
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000/api/v1',
);

/// The single [Dio] instance for the whole app (docs/01_FOUNDATION_AUTH.md
/// §10.4). Every network call goes through this — no screen/repository
/// should construct its own [Dio]. [HeadersInterceptor] runs first (every
/// request needs those headers, error or not); [IdempotencyInterceptor]
/// stamps `Idempotency-Key` on resource-creating POSTs (stage 1.7 mobile);
/// [AuthInterceptor] then attaches the bearer token and handles the
/// single-flight `TOKEN_EXPIRED` refresh; [RetryInterceptor] runs last on
/// the error path, so it only ever sees failures refresh couldn't fix and
/// retries the transient, safe-to-repeat ones with backoff.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );
  dio.interceptors.add(HeadersInterceptor(ref));
  dio.interceptors.add(IdempotencyInterceptor());
  dio.interceptors.add(AuthInterceptor(ref, dio));
  dio.interceptors.add(RetryInterceptor(dio));
  return dio;
});
