import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/core/network/app_check_interceptor.dart';

/// 2026-10-24 (abuse batch D, item 4): the WEBSITE's proof that a person,
/// not a script, asks for a code. Puts a Cloudflare Turnstile token on the
/// same costly anonymous auth routes the App Check interceptor covers, as
/// `X-Turnstile-Token` (the server: modules/auth/turnstile, switch
/// `security.turnstile.mode`).
///
/// Added to the client on the web only (core/network/dio_client.dart); the
/// phones never get it. It does nothing when the bootstrap carries no site
/// key (Turnstile off, or no key saved in Интеграции). It never blocks a
/// request: no token (script blocked, timeout, error) means no header, and
/// the server decides what that means.
class TurnstileInterceptor extends Interceptor {
  TurnstileInterceptor({required this.siteKey, required this.token});

  /// The public site key of the last bootstrap (`turnstile.site_key`), or
  /// null / empty while Turnstile is off.
  final String? Function() siteKey;

  /// Asks the browser for a fresh single-use token for the site key.
  final Future<String?> Function(String siteKey) token;

  static const header = 'X-Turnstile-Token';

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!AppCheckInterceptor.needsToken(options)) {
      return handler.next(options);
    }
    try {
      final key = siteKey();
      if (key != null && key.isNotEmpty) {
        final t = await token(key);
        if (t != null && t.isNotEmpty) options.headers[header] = t;
      }
    } on Object catch (e) {
      // Never block sign-in over the check: send nothing, log.
      debugPrint('turnstile: header skipped ($e)');
    }
    handler.next(options);
  }
}
