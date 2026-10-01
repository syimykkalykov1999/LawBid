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

  /// Screen order for [role] (file 01 §11). Contacts precede profile
  /// because the §11 guard table forces `/onboarding/contacts` straight
  /// after the role step whenever required contacts are unverified.
  /// Attorneys get the extra "Verification & subscription" checklist
  /// (Шаг 4B) before the tour. `role == null` (not chosen yet) uses the
  /// client order, which is what the progress bar shows until the role
  /// step resolves it.
  ///
  /// OQ-048: an assistant only needs a verified phone and a name — then
  /// joins an attorney (AssistantJoinScreen) instead of the tour.
  static List<OnboardingStepId> orderFor(UserRole? role) => [
        consents,
        OnboardingStepId.role,
        contacts,
        profile,
        if (role != UserRole.assistant) ...[
          push,
          if (role == UserRole.attorney) verification,
          tour,
        ],
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
