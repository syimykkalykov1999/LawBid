import 'package:lawbid/shared/domain/user_role.dart';

/// Server-side onboarding step names (docs/01_FOUNDATION_AUTH.md §11;
/// mirrors `ONBOARDING_STEPS` in apps/api/src/modules/users/dto/
/// onboarding.dto.ts). Each maps 1:1 to an `/onboarding/<name>` route —
/// see `OnboardingRoutes.forStep`.
enum OnboardingStepId {
  consents,
  role,
  profile,
  contacts,
  push,
  verification,
  tour;

  /// Parses the wire value; `null` for an unknown/absent step (e.g. a
  /// brand-new account that has never saved a step, or the removed
  /// `language` step — docs/OPEN_QUESTIONS.md OQ-006).
  static OnboardingStepId? tryParse(String? raw) =>
      raw == null ? null : OnboardingStepId.values.asNameMap()[raw];

  /// Screen order for [role] (file 01 §11). Owner 2026-10-13: no contacts
  /// step — the phone is verified by the sign-up code and the e-mail is a
  /// field of the profile step (no code).
  /// Attorneys get the extra "Verification & subscription" checklist
  /// (Шаг 4B) before the tour. `role == null` (not chosen yet) uses the
  /// client order, which is what the progress bar shows until the role
  /// step resolves it.
  ///
  /// OQ-048: an assistant only needs a name — then joins an attorney
  /// (AssistantJoinScreen) instead of the tour. Owner 2026-10-04: no
  /// contacts step either: assistants sign in with the attorney's
  /// one-time code, so no phone (and no SMS) is needed.
  static List<OnboardingStepId> orderFor(UserRole? role) => [
        consents,
        OnboardingStepId.role,
        profile,
        // Owner 2026-10-11: no "Stay in the loop" and no tour — the system
        // asks for notifications after sign-in, and the last step here
        // completes onboarding.
        if (role == UserRole.attorney) verification,
      ];

  /// The step after this one for [role], or `null` when this is the last.
  OnboardingStepId? nextFor(UserRole? role) {
    final order = orderFor(role);
    final index = order.indexOf(this);
    if (index < 0 || index + 1 >= order.length) return null;
    return order[index + 1];
  }

  /// The step before this one for [role], or `null` when this is the first.
  OnboardingStepId? previousFor(UserRole? role) {
    final order = orderFor(role);
    final index = order.indexOf(this);
    if (index <= 0) return null;
    return order[index - 1];
  }
}
