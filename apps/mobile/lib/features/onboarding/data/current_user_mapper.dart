import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Generated `MeDto` (`GET /users/me` and every onboarding mutation,
/// apps/api `MeView`) → domain [CurrentUser]. Same rules as
/// [CurrentUser.fromJson]: an enum value this build doesn't know (the
/// generated enums' `$unknown`, e.g. a future `missing` requirement) is
/// dropped rather than failing the whole response; `admin` (never in this
/// flow) has no app role.
abstract final class CurrentUserMapper {
  static CurrentUser fromDto(api.MeDto dto) {
    final role = switch (dto.role) {
      api.UserRole.client => UserRole.client,
      api.UserRole.attorney => UserRole.attorney,
      _ => null,
    };
    final profile = dto.profile;
    final onboardingData = dto.onboarding.data;
    return CurrentUser(
      id: dto.id,
      role: role,
      status: dto.status.json ?? 'active',
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      emailVerified: dto.emailVerified,
      phone: dto.phone,
      phoneVerified: dto.phoneVerified,
      uiLanguage: dto.uiLanguage,
      theme: dto.theme.json,
      avatarUrl: dto.avatarUrl,
      requiredConsentsGranted: dto.requiredConsentsGranted,
      onboarding: OnboardingProgress(
        currentStep: OnboardingStepId.tryParse(dto.onboarding.currentStep),
        completedAt: dto.onboarding.completedAt,
        data: onboardingData is Map<String, dynamic> ? onboardingData : const {},
      ),
      missing: dto.missing
          .map((m) => m.json)
          .whereType<String>()
          .map(MissingRequirement.tryParse)
          .whereType<MissingRequirement>()
          .toSet(),
      clientProfile: role == UserRole.client && profile?.stateCode != null
          ? ClientProfile(
              stateCode: profile!.stateCode!,
              languages: profile.languages,
              contactMethod: profile.contactMethod?.json,
              contactNote: profile.contactNote,
            )
          : null,
      attorneyProfile: role == UserRole.attorney && profile?.username != null
          ? AttorneyProfile(
              username: profile!.username!,
              bio: profile.bio,
              firmName: profile.firmName,
              languages: profile.languages,
              licensedStates: profile.licensedStates ?? const [],
              verificationStatus:
                  profile.verificationStatus?.json ?? 'unverified',
            )
          : null,
    );
  }
}
