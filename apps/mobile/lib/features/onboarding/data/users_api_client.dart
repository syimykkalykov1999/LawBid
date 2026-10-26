import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// One method per `/users/me*` endpoint the onboarding flow needs
/// (apps/api users.controller.ts), on top of the generated client
/// (`package:lawbid_api`, docs/01 §6.3) driven by the app's own [Dio] and
/// its interceptors. Takes/returns the generated request/response models;
/// [ApiException] on any failure — never a raw [DioException]. Only
/// repositories use this (`.cursorrules`: "Работа с сетью только через
/// репозитории").
class UsersApiClient {
  UsersApiClient(Dio dio)
      : _dio = dio,
        _users = api.UsersClient(dio);

  final Dio _dio;
  final api.UsersClient _users;

  /// Header name of apps/api ReauthGuard (`REAUTH_HEADER`).
  static const reauthHeader = 'X-Reauth-Token';

  /// Resource-creating POSTs: IdempotencyInterceptor stamps an
  /// Idempotency-Key (the server replays a retried call instead of applying
  /// it twice), which also makes them safe for RetryInterceptor.
  static const Map<String, dynamic> _createsResource = {
    RequestFlags.createsResource: true,
  };

  Future<api.MeDto> getMe() async => (await guardApiCall(_users.me)).data;

  Future<api.MeDto> updateProfile(api.UpdateProfileDto body) async =>
      (await guardApiCall(() => _users.updateProfile(body: body))).data;

  /// `POST /users/me/role` — set once (409 ROLE_ALREADY_SET afterwards).
  Future<api.MeDto> setRole(api.SetRoleDtoRole role) async =>
      (await guardApiCall(
        () => _users.setRole(
          body: api.SetRoleDto(role: role),
          extras: _createsResource,
        ),
      ))
          .data;

  Future<api.MeDto> saveOnboardingStep(api.SaveOnboardingStepDto body) async =>
      (await guardApiCall(() => _users.saveOnboardingStep(body: body))).data;

  /// Profile step (docs/01 §11 3A/3B): `currentStep` + the structured
  /// profile in one PATCH. Deliberately NOT sent through the generated
  /// `SaveOnboardingStepDto`: [profile] carries an explicit
  /// `contactMethod: null` to CLEAR a previously chosen method (absent =
  /// unchanged, apps/api UserProfilesService), and the generated models omit
  /// null fields (packages/api-contract/dart/build.yaml). The response is
  /// still parsed as the generated `MeEnvelope`.
  Future<api.MeDto> saveProfileStep(
    api.SaveOnboardingStepDtoCurrentStep next,
    Map<String, dynamic> profile,
  ) async {
    final response = await guardApiCall(
      () => _dio.patch<Map<String, dynamic>>(
        '/users/me/onboarding',
        data: {'currentStep': next.toJson(), 'profile': profile},
      ),
    );
    return guardApiCall(
      () async => api.MeEnvelope.fromJson(response.data!).data,
    );
  }

  Future<api.MeDto> completeOnboarding() async => (await guardApiCall(
        () => _users.completeOnboarding(extras: _createsResource),
      ))
          .data;

  /// `user_consents` is append-only — each call inserts rows, so this is a
  /// resource-creating POST (Idempotency-Key).
  Future<void> saveConsents(List<api.ConsentItemDto> consents) => guardApiCall(
        () => _users.saveConsents(
          body: api.SaveConsentsDto(consents: consents),
          extras: _createsResource,
        ),
      );

  /// Sends a paid SMS/email — keyed so a transparent retry can't send a
  /// second one. [reauthToken] (single-use) is only needed when this
  /// replaces an already-verified contact (docs/01 §11 step 3A).
  Future<void> requestContact({
    required api.ContactRequestDtoType type,
    required String value,
    String? reauthToken,
  }) =>
      guardApiCall(
        () => _users.requestContact(
          body: api.ContactRequestDto(type: type, value: value),
          xReauthToken: reauthToken,
          extras: _createsResource,
        ),
      );

  Future<void> verifyContact({
    required api.ContactVerifyDtoType type,
    required String value,
    required String code,
  }) =>
      guardApiCall(
        () => _users.verifyContact(
          body: api.ContactVerifyDto(type: type, value: value, code: code),
        ),
      );
}
