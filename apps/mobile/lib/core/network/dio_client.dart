import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_config.dart';

import 'auth_interceptor.dart';
import 'headers_interceptor.dart';

/// The API's base URL — see [AppConfig.apiBaseUrl] (set via
/// `--dart-define-from-file=config/dev.json`, docs/KEYS_SETUP.md).
const String apiBaseUrl = AppConfig.apiBaseUrl;

/// The single [Dio] instance for the whole app (docs/01_FOUNDATION_AUTH.md
/// §10.4). Every network call goes through this — no screen/repository
/// should construct its own [Dio]. [HeadersInterceptor] runs first (every
/// request needs those headers, error or not); [AuthInterceptor] runs
/// second so it can see (and act on) the fully-built request/response.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );
  dio.interceptors.add(HeadersInterceptor(ref));
  dio.interceptors.add(AuthInterceptor(ref, dio));
  return dio;
});
