import 'package:dio/dio.dart';

import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';

/// One method per `/users/me*` endpoint the onboarding flow needs
/// (apps/api/src/modules/users/controllers/users.controller.ts). Returns
/// the raw `data` payload; [ApiException] on any failure — never a raw
/// [DioException]. Only repositories use this (`.cursorrules`: "Работа с
/// сетью только через репозитории").
class UsersApiClient {
  UsersApiClient(this._dio);

  final Dio _dio;

  /// Header name of apps/api ReauthGuard (`REAUTH_HEADER`).
  static const reauthHeader = 'X-Reauth-Token';

  Future<Map<String, dynamic>> getMe() =>
      _call(() => _dio.get<Map<String, dynamic>>('/users/me'));

  Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> body) =>
      _call(() => _dio.patch<Map<String, dynamic>>('/users/me', data: body));

  /// `POST /users/me/role` — set once (409 ROLE_ALREADY_SET afterwards), so
  /// it's a resource-creating POST: Idempotency-Key + safe to retry.
  Future<Map<String, dynamic>> setRole(String role) => _call(
        () => _dio.post<Map<String, dynamic>>(
          '/users/me/role',
          data: {'role': role},
          options: RequestFlags.createOptions(),
        ),
      );

  /// [profile] is the structured profile-step payload (apps/api
  /// `OnboardingProfileDto`) — persisted into client_profiles /
  /// attorney_profiles together with the step position.
  Future<Map<String, dynamic>> saveOnboardingStep(
    String currentStep, [
    Map<String, dynamic>? data,
    Map<String, dynamic>? profile,
  ]) =>
      _call(
        () => _dio.patch<Map<String, dynamic>>(
          '/users/me/onboarding',
          data: {
            'currentStep': currentStep,
            if (data != null) 'data': data,
            if (profile != null) 'profile': profile,
          },
        ),
      );

  Future<Map<String, dynamic>> completeOnboarding() => _call(
        () => _dio.post<Map<String, dynamic>>(
          '/users/me/onboarding/complete',
          options: RequestFlags.createOptions(),
        ),
      );

  /// `user_consents` is append-only — each call inserts rows, so this is a
  /// resource-creating POST (Idempotency-Key).
  Future<void> saveConsents(List<Map<String, dynamic>> consents) => _call(
        () => _dio.post<Map<String, dynamic>>(
          '/users/me/consents',
          data: {'consents': consents},
          options: RequestFlags.createOptions(),
        ),
      );

  /// Sends a paid SMS/email — keyed so a transparent retry can't send a
  /// second one. [reauthToken] (single-use) is only needed when this
  /// replaces an already-verified contact (docs/01 §11 step 3A).
  Future<void> requestContact({
    required String type,
    required String value,
    String? reauthToken,
  }) =>
      _call(
        () => _dio.post<Map<String, dynamic>>(
          '/users/me/contacts/request',
          data: {'type': type, 'value': value},
          options: RequestFlags.createOptions(
            headers: reauthToken == null ? null : {reauthHeader: reauthToken},
          ),
        ),
      );

  Future<void> verifyContact({
    required String type,
    required String value,
    required String code,
  }) =>
      _call(
        () => _dio.post<Map<String, dynamic>>(
          '/users/me/contacts/verify',
          data: {'type': type, 'value': value, 'code': code},
        ),
      );

  Future<Map<String, dynamic>> _call(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async {
    try {
      final response = await request();
      final data = response.data?['data'];
      if (data is Map<String, dynamic>) return data;
      return const {};
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }
}
