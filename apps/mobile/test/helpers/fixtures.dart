import 'package:lawbid/features/legal/domain/legal_documents.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// A `GET /users/me` result for tests. Defaults: brand-new account (no
/// role, nothing verified, consents missing, onboarding not started).
CurrentUser meFixture({
  UserRole? role,
  String? firstName,
  String? lastName,
  String? phone,
  bool phoneVerified = false,
  String? email,
  bool emailVerified = false,
  bool consents = false,
  OnboardingStepId? step,
  bool completed = false,
  Map<String, dynamic> data = const {},
  List<PendingLegalDocument> pendingLegal = const [],
  // Owner 2026-10-07: false = admin «Вход и письма по почте» off (the
  // server asks no client e-mail).
  bool clientEmailRequired = true,
}) {
  final hasName = (firstName ?? '').isNotEmpty && (lastName ?? '').isNotEmpty;
  return CurrentUser(
    id: '00000000-0000-4000-8000-000000000001',
    role: role,
    status: 'active',
    firstName: firstName,
    lastName: lastName,
    email: email,
    emailVerified: emailVerified,
    phone: phone,
    phoneVerified: phoneVerified,
    uiLanguage: 'en',
    theme: null,
    requiredConsentsGranted: consents,
    pendingLegalDocuments: pendingLegal,
    onboarding: OnboardingProgress(
      currentStep: step,
      completedAt: completed ? DateTime.utc(2026, 9, 27) : null,
      data: data,
    ),
    // Mirrors apps/api missingRequirements().
    missing: {
      if (!consents) MissingRequirement.consents,
      if (role == null) MissingRequirement.role,
      if (!hasName) MissingRequirement.name,
      // Owner 2026-10-04: assistants sign in with a code, no phone.
      if ((role == UserRole.client || role == UserRole.attorney) &&
          !phoneVerified)
        MissingRequirement.phoneVerified,
      if (clientEmailRequired && role == UserRole.client && !emailVerified)
        MissingRequirement.emailVerified,
    },
  );
}
