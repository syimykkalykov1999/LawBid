import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/onboarding/data/current_user_mapper.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Account + onboarding operations (docs/01_FOUNDATION_AUTH.md §10.2 H,
/// §10.5, §11). Every method that the server answers with the fresh
/// `MeView` returns it as a [CurrentUser], so the caller can update
/// session state without an extra `GET /users/me`. Throws [ApiException].
abstract interface class OnboardingRepository {
  Future<CurrentUser> fetchMe();

  Future<CurrentUser> updateProfile({
    String? firstName,
    String? lastName,
    String? uiLanguage,
    String? theme,
  });

  /// `POST /users/me/role`. A 409 `ROLE_ALREADY_SET` for the SAME role is
  /// treated as success (a retried tap after a lost response) — the fresh
  /// me is returned either way.
  Future<CurrentUser> setRole(UserRole role);

  Future<CurrentUser> saveStep(OnboardingStepId step,
      [Map<String, dynamic>? data]);

  /// Profile step (docs/01 §11 3A/3B): names + structured profile +
  /// moving to [next], in ONE server transaction. Throws
  /// `VALIDATION_ERROR` (400) for an unknown state / language etc.
  Future<CurrentUser> saveProfileStep(
      OnboardingStepId next, ProfileInput profile);

  /// Throws `CLIENT_CONTACTS_INCOMPLETE` / `ONBOARDING_INCOMPLETE` (403,
  /// `details.missing`) when the server's hard requirements don't hold.
  Future<CurrentUser> completeOnboarding();

  Future<void> saveConsents(List<ConsentDecision> consents);

  /// `POST /auth/otp/request` to one of the account's VERIFIED contacts —
  /// the first half of `POST /auth/reauth` (the server verifies it with the
  /// 'login' OTP purpose, see AuthService.reauth).
  Future<void> requestReauthCode(
      {required String channel, required String identifier});

  /// `POST /auth/reauth` → single-use `reauthToken` (5 min).
  Future<String> reauth({required String identifier, required String code});

  /// `POST /users/me/contacts/request`. [reauthToken] is required only
  /// when replacing an already-verified contact of this [type].
  Future<void> requestContactCode({
    required ContactType type,
    required String value,
    String? reauthToken,
  });

  Future<void> verifyContact({
    required ContactType type,
    required String value,
    required String code,
  });
}

class ApiOnboardingRepository implements OnboardingRepository {
  ApiOnboardingRepository(this._users, this._auth);

  final UsersApiClient _users;
  final AuthApiClient _auth;

  @override
  Future<CurrentUser> fetchMe() async =>
      CurrentUserMapper.fromDto(await _users.getMe());

  @override
  Future<CurrentUser> updateProfile({
    String? firstName,
    String? lastName,
    String? uiLanguage,
    String? theme,
  }) async {
    // Unset fields are omitted from the body (generated models skip
    // nulls), so the server leaves them unchanged.
    final body = api.UpdateProfileDto(
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      uiLanguage: uiLanguage,
      theme: theme == null ? null : api.UpdateProfileDtoTheme.fromJson(theme),
    );
    return CurrentUserMapper.fromDto(await _users.updateProfile(body));
  }

  @override
  Future<CurrentUser> setRole(UserRole role) async {
    try {
      return CurrentUserMapper.fromDto(
        await _users.setRole(api.SetRoleDtoRole.fromJson(role.name)),
      );
    } on ApiException catch (e) {
      if (e.code != ApiErrorCodes.roleAlreadySet) rethrow;
      final me = await fetchMe();
      if (me.role == role) return me;
      rethrow;
    }
  }

  @override
  Future<CurrentUser> saveStep(OnboardingStepId step,
          [Map<String, dynamic>? data]) async =>
      CurrentUserMapper.fromDto(
        await _users.saveOnboardingStep(
          api.SaveOnboardingStepDto(currentStep: _step(step), data: data),
        ),
      );

  @override
  Future<CurrentUser> saveProfileStep(
          OnboardingStepId next, ProfileInput profile) async =>
      CurrentUserMapper.fromDto(
        await _users.saveProfileStep(_step(next), profile.toJson()),
      );

  @override
  Future<CurrentUser> completeOnboarding() async =>
      CurrentUserMapper.fromDto(await _users.completeOnboarding());

  @override
  Future<void> saveConsents(List<ConsentDecision> consents) =>
      _users.saveConsents(
        consents
            .map(
              (c) => api.ConsentItemDto(
                type: api.ConsentItemDtoType.fromJson(c.type.wireName),
                granted: c.granted,
                documentId: c.documentId,
              ),
            )
            .toList(growable: false),
      );

  @override
  Future<void> requestReauthCode(
          {required String channel, required String identifier}) =>
      _auth.requestOtp(channel: channel, identifier: identifier);

  @override
  Future<String> reauth({required String identifier, required String code}) =>
      _auth.reauth(identifier: identifier, code: code);

  @override
  Future<void> requestContactCode({
    required ContactType type,
    required String value,
    String? reauthToken,
  }) =>
      _users.requestContact(
        type: api.ContactRequestDtoType.fromJson(type.wireName),
        value: value,
        reauthToken: reauthToken,
      );

  @override
  Future<void> verifyContact({
    required ContactType type,
    required String value,
    required String code,
  }) =>
      _users.verifyContact(
        type: api.ContactVerifyDtoType.fromJson(type.wireName),
        value: value,
        code: code,
      );

  static api.SaveOnboardingStepDtoCurrentStep _step(OnboardingStepId step) =>
      api.SaveOnboardingStepDtoCurrentStep.fromJson(step.name);
}
