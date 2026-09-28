import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/app_update/app_update_interceptor.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/reachability.dart';

import 'auth_interceptor.dart';
import 'headers_interceptor.dart';
import 'idempotency_interceptor.dart';
import 'retry_interceptor.dart';

/// The single [Dio] instance for the whole app (docs/01_FOUNDATION_AUTH.md
/// §10.4). Every network call goes through this — no screen/repository
/// should construct its own [Dio]. [HeadersInterceptor] runs first (every
/// request needs those headers, error or not); [AppUpdateInterceptor]
/// turns a `426 APP_UPDATE_REQUIRED` from any request into the
/// forced-update screen (p12 leaf-1.4); [IdempotencyInterceptor]
/// stamps `Idempotency-Key` on resource-creating POSTs (stage 1.7 mobile);
/// [AuthInterceptor] then attaches the bearer token and handles the
/// single-flight `TOKEN_EXPIRED` refresh; [RetryInterceptor] runs last on
/// the error path, so it only ever sees failures refresh couldn't fix and
/// retries the transient, safe-to-repeat ones with backoff.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      // Per-flavor default, overridable with --dart-define API_BASE_URL
      // (core/config/app_environment.dart).
      baseUrl: ref.watch(appEnvironmentProvider).apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );
  dio.interceptors.add(HeadersInterceptor(ref));
  dio.interceptors.add(AppUpdateInterceptor(ref));
  dio.interceptors.add(IdempotencyInterceptor());
  dio.interceptors.add(AuthInterceptor(ref, dio));
  dio.interceptors.add(RetryInterceptor(dio));
  // Last on purpose: feeds the offline banner's reachability signal from
  // real traffic, seeing only failures the retries could not fix
  // (docs/01 §8.3; core/connectivity/reachability.dart).
  dio.interceptors.add(
    ReachabilityInterceptor(() => ref.read(reachabilitySignalProvider)),
  );
  return dio;
});

/// Bare [Dio] for direct uploads to object storage (presigned S3 POST,
/// docs/03 §2.2): NO app interceptors — the bearer token, app headers and
/// the API retry policy must never reach the storage host. Only upload
/// repositories use it; overridable in tests.
final storageDioProvider = Provider<Dio>(
  (ref) => Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 60),
      receiveTimeout: const Duration(seconds: 30),
    ),
  ),
);
