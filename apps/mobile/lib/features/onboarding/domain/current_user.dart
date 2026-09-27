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
  emailVerified;

  static MissingRequirement? tryParse(String raw) => switch (raw) {
        'consents' => consents,
        'role' => role,
        'name' => name,
        'phone_verified' => phoneVerified,
        'email_verified' => emailVerified,
        _ => null,
      };
}

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
      completedAt: completedAt is String ? DateTime.tryParse(completedAt) : null,
      data: data is Map<String, dynamic> ? data : const {},
    );
  }

  final OnboardingStepId? currentStep;
  final DateTime? completedAt;

  /// Step-local form data, merged server-side on every PATCH (state,
  /// preferred languages, contact method, bio, …) until the dedicated
  /// profile tables land (file 03).
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
  });

  factory CurrentUser.fromJson(Map<String, dynamic> json) {
    final rawMissing = json['missing'];
    return CurrentUser(
      id: json['id'] as String,
      role: parseUserRole(json['role'] as String?),
      status: json['status'] as String? ?? 'active',
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      email: json['email'] as String?,
      emailVerified: json['emailVerified'] as bool? ?? false,
      phone: json['phone'] as String?,
      phoneVerified: json['phoneVerified'] as bool? ?? false,
      uiLanguage: json['uiLanguage'] as String? ?? 'en',
      theme: json['theme'] as String?,
      requiredConsentsGranted: json['requiredConsentsGranted'] as bool? ?? false,
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

  bool get isClient => role == UserRole.client;
  bool get isAttorney => role == UserRole.attorney;

  /// The verified contact a `POST /auth/reauth` code can be sent to —
  /// phone first, then email (see `AuthService.reauth` in apps/api).
  ({String channel, String identifier})? get reauthIdentifier {
    if (phoneVerified && phone != null) return (channel: 'phone', identifier: phone!);
    if (emailVerified && email != null) return (channel: 'email', identifier: email!);
    return null;
  }
}

UserRole? parseUserRole(String? raw) => switch (raw) {
      'client' => UserRole.client,
      'attorney' => UserRole.attorney,
      _ => null,
    };
