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
  AppCheckInterceptor({required this.token, this.status, this.limitedToken});

  /// The current token, or null when there is none
  /// (core/security/app_check.dart).
  final Future<String?> Function({bool forceRefresh}) token;

  /// Item 13: a fresh limited-use token for [limitedRoutes], or null (no
  /// Firebase, attestation failed, timeout). Phones only.
  final Future<String?> Function()? limitedToken;

  /// Why [token] gave nothing (core/security/app_check.dart, `status`).
  final String? Function()? status;

  static const header = 'X-Firebase-AppCheck';

  /// 2026-11-08: sent instead of [header] when there is no token, so the
  /// server log (`metric: app_check`, `clientStatus`) shows which step
  /// fails on real phones. Never blocks anything.
  static const statusHeader = 'X-Firebase-AppCheck-Status';

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

  /// Item 13 (2026-11-25): starting a payment (signed-in) carries the token
  /// too (server switch `security.app_check.payments.mode`, log only by
  /// default). `*` stands for one path segment (the pack id).
  static const paymentRoutes = [
    '/client-plans/checkout',
    '/verification/client/checkout',
    '/stars/packs/*/buy',
    '/bid-packs/*/buy',
  ];

  /// Item 13: the routes where the server may CONSUME the token (Firebase
  /// replay protection, `security.app_check.replay.mode`). There the app
  /// sends a limited-use token (`getLimitedUseToken`), made to be used
  /// once, and says so in [limitedHeader].
  static const limitedRoutes = [
    '/auth/otp/request',
    '/auth/password/reset/request',
    '/auth/phone/status',
    ...paymentRoutes,
  ];

  /// `1` = the token on this request is limited-use. Phones only (on the
  /// web an extra header is a CORS preflight against an older server).
  static const limitedHeader = 'X-Firebase-AppCheck-Limited';

  static bool _matches(String path, String route) {
    if (!route.contains('*')) return path == route || path.endsWith(route);
    final pattern = RegExp(
      '${route.split('*').map(RegExp.escape).join('[^/]+')}\$',
    );
    return pattern.hasMatch(path);
  }

  /// True for a POST to one of [routes] or [paymentRoutes].
  static bool needsToken(RequestOptions options) {
    if (options.method.toUpperCase() != 'POST') return false;
    final path = options.uri.path;
    return routes.any((r) => _matches(path, r)) ||
        paymentRoutes.any((r) => _matches(path, r));
  }

  /// True for a POST to one of [limitedRoutes].
  static bool needsLimitedToken(RequestOptions options) {
    if (options.method.toUpperCase() != 'POST') return false;
    final path = options.uri.path;
    return limitedRoutes.any((r) => _matches(path, r));
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
      final limited = limitedToken != null && needsLimitedToken(options);
      // A limited-use token is always fresh; if the device cannot make one,
      // the normal cached token still goes (never worse than before).
      var t = limited ? await limitedToken!() : null;
      final isLimited = t != null && t.isNotEmpty;
      if (!isLimited) t = await token(forceRefresh: forceRefresh);
      if (t != null && t.isNotEmpty) {
        options.headers[header] = t;
        if (isLimited) options.headers[limitedHeader] = '1';
      } else {
        _putStatus(options, () => status?.call() ?? 'none');
      }
    } on Object catch (e) {
      // Never block sign-in over the attestation: send nothing, log.
      debugPrint('app check: header skipped ($e)');
      _putStatus(options, () => 'interceptor: ${e.runtimeType}');
    }
    handler.next(options);
  }

  /// Only when a [status] source was given (the phones; not the web).
  void _putStatus(RequestOptions options, String Function() value) {
    if (status == null) return;
    final clean = value().replaceAll(RegExp(r'[^\x20-\x7E]'), ' ').trim();
    if (clean.isEmpty) return;
    options.headers[statusHeader] =
        clean.length <= 120 ? clean : clean.substring(0, 120);
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
