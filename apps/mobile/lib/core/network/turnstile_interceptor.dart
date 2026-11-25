import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;

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

  /// Asks the browser for a fresh single-use token for the site key; the
  /// widget names [action] (item 13: the server refuses a token solved for
  /// another form).
  final Future<String?> Function(String siteKey, {String? action}) token;

  static const header = 'X-Turnstile-Token';

  /// Item 13 (2026-11-25): the route group each sign-in route belongs to on
  /// the server (`security.app_check.<group>.mode`), sent as the Turnstile
  /// action. Only these routes get a token (never payments: signed-in).
  static const actions = {
    '/auth/otp/request': 'sms',
    '/auth/phone/status': 'sms',
    '/auth/otp/verify': 'login',
    '/auth/password/login': 'login',
    '/auth/social': 'login',
    '/auth/password/reset/request': 'password_reset',
  };

  /// The action of a POST to one of [actions], or null.
  static String? actionFor(RequestOptions options) {
    if (options.method.toUpperCase() != 'POST') return null;
    final path = options.uri.path;
    for (final e in actions.entries) {
      if (path == e.key || path.endsWith(e.key)) return e.value;
    }
    return null;
  }

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final action = actionFor(options);
    if (action == null) return handler.next(options);
    try {
      final key = siteKey();
      if (key != null && key.isNotEmpty) {
        final t = await token(key, action: action);
        if (t != null && t.isNotEmpty) options.headers[header] = t;
      }
    } on Object catch (e) {
      // Never block sign-in over the check: send nothing, log.
      debugPrint('turnstile: header skipped ($e)');
    }
    handler.next(options);
  }
}
