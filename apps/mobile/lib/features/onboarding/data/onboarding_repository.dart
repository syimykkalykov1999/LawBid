import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

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

  Future<CurrentUser> saveStep(OnboardingStepId step, [Map<String, dynamic>? data]);

  /// Throws `CLIENT_CONTACTS_INCOMPLETE` / `ONBOARDING_INCOMPLETE` (403,
  /// `details.missing`) when the server's hard requirements don't hold.
  Future<CurrentUser> completeOnboarding();

  Future<void> saveConsents(List<ConsentDecision> consents);

  /// `POST /auth/otp/request` to one of the account's VERIFIED contacts —
  /// the first half of `POST /auth/reauth` (the server verifies it with the
  /// 'login' OTP purpose, see AuthService.reauth).
  Future<void> requestReauthCode({required String channel, required String identifier});

  /// `POST /auth/reauth` → single-use `reauthToken` (5 min).
  Future<String> reauth({required String identifier, required String code});

  /// `POST /users/me/contacts/request` — needs a fresh [reauthToken].
  Future<void> requestContactCode({
    required ContactType type,
    required String value,
    required String reauthToken,
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
  Future<CurrentUser> fetchMe() async => CurrentUser.fromJson(await _users.getMe());

  @override
  Future<CurrentUser> updateProfile({
    String? firstName,
    String? lastName,
    String? uiLanguage,
    String? theme,
  }) async {
    final body = <String, dynamic>{
      if (firstName != null) 'firstName': firstName.trim(),
      if (lastName != null) 'lastName': lastName.trim(),
      if (uiLanguage != null) 'uiLanguage': uiLanguage,
      if (theme != null) 'theme': theme,
    };
    return CurrentUser.fromJson(await _users.updateProfile(body));
  }

  @override
  Future<CurrentUser> setRole(UserRole role) async {
    try {
      return CurrentUser.fromJson(await _users.setRole(role.name));
    } on ApiException catch (e) {
      if (e.code != ApiErrorCodes.roleAlreadySet) rethrow;
      final me = await fetchMe();
      if (me.role == role) return me;
      rethrow;
    }
  }

  @override
  Future<CurrentUser> saveStep(OnboardingStepId step, [Map<String, dynamic>? data]) async =>
      CurrentUser.fromJson(await _users.saveOnboardingStep(step.name, data));

  @override
  Future<CurrentUser> completeOnboarding() async =>
      CurrentUser.fromJson(await _users.completeOnboarding());

  @override
  Future<void> saveConsents(List<ConsentDecision> consents) =>
      _users.saveConsents(consents.map((c) => c.toJson()).toList(growable: false));

  @override
  Future<void> requestReauthCode({required String channel, required String identifier}) =>
      _auth.requestOtp(channel: channel, identifier: identifier);

  @override
  Future<String> reauth({required String identifier, required String code}) async {
    final result = await _auth.reauth(ReauthPayload(identifier: identifier, code: code));
    return result.reauthToken;
  }

  @override
  Future<void> requestContactCode({
    required ContactType type,
    required String value,
    required String reauthToken,
  }) =>
      _users.requestContact(type: type.wireName, value: value, reauthToken: reauthToken);

  @override
  Future<void> verifyContact({
    required ContactType type,
    required String value,
    required String code,
  }) =>
      _users.verifyContact(type: type.wireName, value: value, code: code);
}
