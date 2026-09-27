import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_error.dart';
import 'app_update_providers.dart';

/// Catches `426 Upgrade Required` / `APP_UPDATE_REQUIRED` from ANY request
/// (docs/01_FOUNDATION_AUTH.md §7: the server's `AppVersionGuard` checks
/// `X-App-Version` on every call) and flips [forcedUpdateProvider], which
/// makes `AppUpdateGate` cover the whole app with the forced-update screen
/// wherever the user currently is.
///
/// The error is still passed on unchanged, so the calling repository
/// fails the way it always did; nothing retries a 426 (RetryInterceptor
/// only retries network errors / 5xx).
class AppUpdateInterceptor extends Interceptor {
  AppUpdateInterceptor(this._ref);

  final Ref _ref;

  static const statusUpgradeRequired = 426;
  static const errorCode = 'APP_UPDATE_REQUIRED';

  /// True for either signal: the status code alone (a proxy that rewrote
  /// the body) or the error code alone (defensive: a gateway that changed
  /// the status).
  static bool isUpdateRequired(DioException err) {
    if (err.response?.statusCode == statusUpgradeRequired) return true;
    return ApiException.fromDioException(err).code == errorCode;
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (isUpdateRequired(err)) {
      _ref.read(forcedUpdateProvider.notifier).markRequired();
    }
    handler.next(err);
  }
}
