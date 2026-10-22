import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/account_status/account_restricted.dart';
import 'package:lawbid/core/account_status/account_suspended.dart';
import 'package:lawbid/core/app_update/app_update_interceptor.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/reachability.dart';

import 'package:lawbid/core/network/app_check_interceptor.dart';
import 'package:lawbid/core/network/auth_interceptor.dart';
import 'package:lawbid/core/network/headers_interceptor.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/core/network/retry_interceptor.dart';
import 'package:lawbid/core/security/app_check.dart';
import 'package:lawbid/features/legal/application/legal_reaccept_interceptor.dart';

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
  // Security research #5 (2026-10-22), B1: `X-Firebase-AppCheck` on the
  // costly anonymous auth routes only (docs/runbooks/APP_CHECK.md).
  dio.interceptors.add(
    AppCheckInterceptor(token: ref.read(appCheckTokenProvider)),
  );
  dio.interceptors.add(AppUpdateInterceptor(ref));
  dio.interceptors.add(AccountSuspendedInterceptor(ref));
  dio.interceptors.add(AccountRestrictedInterceptor(ref));
  dio.interceptors.add(LegalReacceptInterceptor(ref));
  dio.interceptors.add(IdempotencyInterceptor());
  dio.interceptors.add(AuthInterceptor(ref, dio));
  // After Auth (it needs the bearer to key the cache per user), before Retry
  // (a retried GET asks again with the tag). Owner 2026-10-22 (client
  // economy plan, package D): memory + disk (core/cache).
  // Off: --dart-define=ETAG_CACHE=false.
  if (const bool.fromEnvironment('ETAG_CACHE', defaultValue: true)) {
    dio.interceptors.add(ref.watch(httpCacheInterceptorProvider));
  }
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
///
/// On the web the browser has one timer for the whole request (Dio adds
/// connect + receive), so a photo or video that takes longer than that to
/// send on phone data was cut off: the web waits as long as the upload
/// needs, the browser still ends a dead connection itself.
final storageDioProvider = Provider<Dio>(
  (ref) => Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: kIsWeb ? null : const Duration(seconds: 60),
      receiveTimeout: kIsWeb ? null : const Duration(seconds: 30),
    ),
  ),
);
