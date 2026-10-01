import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session_providers.dart';
import 'api_error.dart';
import '../l10n/api_error_text.dart';
import '../l10n/l10n_providers.dart';
import '../navigation/root_messenger.dart';

/// Attaches `Authorization: Bearer <accessToken>` to every request that
/// doesn't opt out via `extra['skipAuth'] == true` (the 4 token-issuing
/// endpoints — otp/request, otp/verify, social, refresh — set that flag;
/// see `AuthApiClient`), and silently refreshes on a genuinely expired
/// token before retrying the original request once.
///
/// TOKEN_EXPIRED IS THE ONLY CODE THAT TRIGGERS A REFRESH RETRY
/// (`ErrorCode.TOKEN_EXPIRED`'s doc comment in apps/api,
/// docs/01_FOUNDATION_AUTH.md §10.4): any other 401 (`UNAUTHORIZED`,
/// `AUTH_SESSION_REVOKED`, a bad signature) means refreshing can't fix it —
/// retrying those would loop forever.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._ref, this._dio);

  final Ref _ref;
  final Dio _dio;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (options.extra['skipAuth'] != true) {
      final session = _ref.read(sessionControllerProvider);
      if (session != null) {
        options.headers['Authorization'] = 'Bearer ${session.accessToken}';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final apiError = ApiException.fromDioException(err);
    final alreadyRetried = err.requestOptions.extra['retriedAfterRefresh'] == true;

    // Owner 2026-10-01: this account signed in on another phone (one
    // phone + one website per account) or the session was ended — sign
    // out here, saying why.
    if (apiError.code == ApiErrorCodes.authSignedInElsewhere ||
        apiError.code == ApiErrorCodes.authSessionRevoked) {
      if (_ref.read(sessionControllerProvider) != null) {
        await _ref.read(sessionControllerProvider.notifier).clear();
        rootMessengerKey.currentState?.showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 6),
            content: Text(apiErrorText(_ref.read(translatorProvider), apiError)),
          ),
        );
      }
      handler.next(err);
      return;
    }

    if (apiError.code != ApiErrorCodes.tokenExpired || alreadyRetried) {
      handler.next(err);
      return;
    }

    try {
      final newAccessToken =
          await _ref.read(sessionControllerProvider.notifier).refreshAccessToken();
      final retryOptions = err.requestOptions
        ..headers['Authorization'] = 'Bearer $newAccessToken'
        ..extra = {...err.requestOptions.extra, 'retriedAfterRefresh': true};
      final response = await _dio.fetch<dynamic>(retryOptions);
      handler.resolve(response);
    } catch (_) {
      // Refresh itself failed (expired/reused/invalid refresh token, or a
      // network error while refreshing) — the session is unrecoverable.
      // `SessionController.refreshAccessToken()` already cleared state and
      // secure storage on failure; propagate the ORIGINAL error so the
      // caller sees why its own request actually failed, and the router's
      // next redirect check (`AppRouterGuard`) drops the user to
      // `/welcome`.
      handler.next(err);
    }
  }
}
