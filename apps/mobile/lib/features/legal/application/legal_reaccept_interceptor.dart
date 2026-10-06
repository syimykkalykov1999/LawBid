import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Owner 2026-10-05 (legal documents): publishing a case and placing a bid
/// answer `403 LEGAL_REACCEPT_REQUIRED` while the user owes an acceptance.
/// The app normally already shows the acceptance screen; if the list was
/// stale (documents published while the app was open), this re-reads
/// `GET /users/me` so AppRouterGuard moves the user there.
class LegalReacceptInterceptor extends Interceptor {
  LegalReacceptInterceptor(this._ref);

  final Ref _ref;

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final e = ApiException.fromDioException(err);
    if (e.code == ApiErrorCodes.legalReacceptRequired) {
      unawaited(_ref.read(currentUserControllerProvider.notifier).load());
    }
    handler.next(err);
  }
}
