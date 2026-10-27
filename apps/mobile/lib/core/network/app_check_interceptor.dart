import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/network/api_error.dart';

/// Security research #5 (2026-10-22), B1: puts the Firebase App Check
/// token on the costly anonymous auth routes as `X-Firebase-AppCheck`
/// (docs/runbooks/APP_CHECK.md) — the code request (SMS costs money), the
/// password reset, the social sign-in and «is this number registered».
/// Every other request is left alone: the server looks at nothing else.
///
/// Without a token (no Firebase in this build, attestation failed,
/// timeout) the request goes out as before — in `monitor` mode the server
/// only logs it; in `enforce` mode it answers `403
/// DEVICE_ATTESTATION_REQUIRED`, which the screens show as «update the
/// app» (core/l10n/api_error_text.dart). After that answer the next
/// attempt asks the SDK for a fresh token instead of the cached one.
class AppCheckInterceptor extends Interceptor {
  AppCheckInterceptor({required this.token});

  /// The current token, or null when there is none
  /// (core/security/app_check.dart).
  final Future<String?> Function({bool forceRefresh}) token;

  static const header = 'X-Firebase-AppCheck';

  /// The routes the server verifies (relative to `/api/v1`).
  static const routes = [
    '/auth/otp/request',
    '/auth/password/reset/request',
    '/auth/social',
    '/auth/phone/status',
    // 2026-10-25 (S14-13): the server asks for the token only after several
    // wrong passwords / codes for one account (admin setting
    // security.auth_challenge_after_failures, off by default); the happy
    // path is never blocked by it.
    '/auth/password/login',
    '/auth/otp/verify',
  ];

  /// True for a POST to one of [routes].
  static bool needsToken(RequestOptions options) {
    if (options.method.toUpperCase() != 'POST') return false;
    final path = options.uri.path;
    return routes.any((r) => path == r || path.endsWith(r));
  }

  /// Set once the server refused a request for a missing / stale token:
  /// the next token is force-refreshed.
  bool _refreshNext = false;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!needsToken(options)) return handler.next(options);
    try {
      final forceRefresh = _refreshNext;
      _refreshNext = false;
      final t = await token(forceRefresh: forceRefresh);
      if (t != null && t.isNotEmpty) options.headers[header] = t;
    } on Object catch (e) {
      // Never block sign-in over the attestation: send nothing, log.
      debugPrint('app check: header skipped ($e)');
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (ApiException.fromDioException(err).code ==
        ApiErrorCodes.deviceAttestationRequired) {
      _refreshNext = true;
    }
    handler.next(err);
  }
}
