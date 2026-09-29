import 'package:flutter/foundation.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// What still blocks `POST /users/me/onboarding/complete` — the `missing`
/// array of `GET /users/me` (apps/api `MissingRequirement`). The router
/// guard redirects on these instead of re-deriving the server's rules.
enum MissingRequirement {
  consents,
  role,
  name,
  phoneVerified,
  emailVerified,

  /// A profile-step field the server requires before completion: the
  /// client's state of residence (`state`) or the attorney's licensed
  /// states (`licensed_states`) — docs/01 §11 3A/3B.
  profile,

  /// The attorney has no clean photo yet — mandatory (docs/03 §4.1,
  /// OQ-012); collected on the profile step.
  photo;

  static MissingRequirement? tryParse(String raw) => switch (raw) {
        'consents' => consents,
        'role' => role,
        'name' => name,
        'phone_verified' => phoneVerified,
        'email_verified' => emailVerified,
        'state' || 'licensed_states' => profile,
        'photo' => photo,
        _ => null,
      };
}

/// `profile` of `GET /users/me` for a client (client_profiles, docs/02
/// §4.C).
@immutable
class ClientProfile {
  const ClientProfile({
    required this.stateCode,
    this.username,
    this.languages = const [],
    this.contactMethod,
    this.contactNote,
  });

  factory ClientProfile.fromJson(Map<String, dynamic> json) => ClientProfile(
        stateCode: json['stateCode'] as String,
        username: json['username'] as String?,
        languages: _stringList(json['languages']),
        contactMethod: json['contactMethod'] as String?,
        contactNote: json['contactNote'] as String?,
      );

  /// OQ-026: clients have @usernames too (null only on very old caches).
  final String? username;
  final String stateCode;
  final List<String> languages;

  /// Wire value: `call` / `sms` / `email` / `in_app_chat`.
  final String? contactMethod;
  final String? contactNote;
}

/// `profile` of `GET /users/me` for an attorney (attorney_profiles + the
/// licensed states picked on the profile step, docs/01 §11 3B).
@immutable
class AttorneyProfile {
  const AttorneyProfile({
    required this.username,
    this.bio,
    this.firmName,
    this.languages = const [],
    this.licensedStates = const [],
    this.verificationStatus = 'unverified',
  });

  factory AttorneyProfile.fromJson(Map<String, dynamic> json) =>
      AttorneyProfile(
        username: json['username'] as String,
        bio: json['bio'] as String?,
        firmName: json['firmName'] as String?,
        languages: _stringList(json['languages']),
        licensedStates: _stringList(json['licensedStates']),
        verificationStatus:
            json['verificationStatus'] as String? ?? 'unverified',
      );

  final String username;
  final String? bio;
  final String? firmName;
  final List<String> languages;
  final List<String> licensedStates;
  final String verificationStatus;
}

List<String> _stringList(Object? raw) =>
    raw is List ? raw.whereType<String>().toList(growable: false) : const [];

/// `onboarding` object of `GET /users/me`.
@immutable
class OnboardingProgress {
  const OnboardingProgress({
    this.currentStep,
    this.completedAt,
    this.data = const {},
  });

  factory OnboardingProgress.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const OnboardingProgress();
    final data = json['data'];
    final completedAt = json['completedAt'];
    return OnboardingProgress(
      currentStep: OnboardingStepId.tryParse(json['currentStep'] as String?),
      completedAt:
          completedAt is String ? DateTime.tryParse(completedAt) : null,
      data: data is Map<String, dynamic> ? data : const {},
    );
  }

  final OnboardingStepId? currentStep;
  final DateTime? completedAt;

  /// Free-form step-local data, merged server-side on every PATCH. The
  /// profile itself lives in [CurrentUser.clientProfile] /
  /// [CurrentUser.attorneyProfile]; older builds kept it here under
  /// `profile`, which the prefill still reads as a fallback.
  final Map<String, dynamic> data;

  bool get isCompleted => completedAt != null;
}

/// `GET /users/me` (apps/api `MeView`) — the single source the router
/// guard, the role-aware shell and every onboarding step read from.
@immutable
class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.role,
    required this.status,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.emailVerified,
    required this.phone,
    required this.phoneVerified,
    required this.uiLanguage,
    required this.theme,
    required this.requiredConsentsGranted,
    required this.onboarding,
    required this.missing,
    this.clientProfile,
    this.attorneyProfile,
    this.avatarUrl,
  });

  factory CurrentUser.fromJson(Map<String, dynamic> json) {
    final rawMissing = json['missing'];
    final role = parseUserRole(json['role'] as String?);
    final rawProfile = json['profile'];
    final profile = rawProfile is Map<String, dynamic> ? rawProfile : null;
    return CurrentUser(
      clientProfile: role == UserRole.client &&
              profile != null &&
              profile['stateCode'] is String
          ? ClientProfile.fromJson(profile)
          : null,
      attorneyProfile: role == UserRole.attorney &&
              profile != null &&
              profile['username'] is String
          ? AttorneyProfile.fromJson(profile)
          : null,
      id: json['id'] as String,
      role: role,
      status: json['status'] as String? ?? 'active',
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      email: json['email'] as String?,
      emailVerified: json['emailVerified'] as bool? ?? false,
      phone: json['phone'] as String?,
      phoneVerified: json['phoneVerified'] as bool? ?? false,
      uiLanguage: json['uiLanguage'] as String? ?? 'en',
      theme: json['theme'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      requiredConsentsGranted:
          json['requiredConsentsGranted'] as bool? ?? false,
      onboarding: OnboardingProgress.fromJson(
        json['onboarding'] as Map<String, dynamic>?,
      ),
      missing: rawMissing is List
          ? rawMissing
              .whereType<String>()
              .map(MissingRequirement.tryParse)
              .whereType<MissingRequirement>()
              .toSet()
          : const {},
    );
  }

  final String id;

  /// `null` until the role step (file 01 §11 Шаг 2) is done. `admin` (not
  /// selectable in the app) also parses to `null` — admins never go
  /// through this flow.
  final UserRole? role;
  final String status;
  final String? firstName;
  final String? lastName;
  final String? email;
  final bool emailVerified;
  final String? phone;
  final bool phoneVerified;
  final String uiLanguage;
  final String? theme;
  final bool requiredConsentsGranted;
  final OnboardingProgress onboarding;
  final Set<MissingRequirement> missing;

  /// Saved client_profiles row; null before the profile step.
  final ClientProfile? clientProfile;

  /// Saved attorney_profiles row; null before the profile step.
  final AttorneyProfile? attorneyProfile;

  /// Short-lived signed link to the profile photo (docs/03 §4.1, 1024 px
  /// JPEG); null when no photo is set.
  final String? avatarUrl;

  bool get isClient => role == UserRole.client;
  bool get isAttorney => role == UserRole.attorney;

  /// The verified contact a `POST /auth/reauth` code can be sent to —
  /// phone first, then email (see `AuthService.reauth` in apps/api).
  ({String channel, String identifier})? get reauthIdentifier {
    if (phoneVerified && phone != null)
      return (channel: 'phone', identifier: phone!);
    if (emailVerified && email != null)
      return (channel: 'email', identifier: email!);
    return null;
  }
}

UserRole? parseUserRole(String? raw) => switch (raw) {
      'client' => UserRole.client,
      'attorney' => UserRole.attorney,
      _ => null,
    };
