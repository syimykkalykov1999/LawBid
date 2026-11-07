import 'package:lawbid/features/verification/application/verification_overview_controller.dart';

/// Owner 2026-10-04: the attorney part of onboarding (`/onboarding/
/// verification`) is ONE linear sequence, each stage shown once and read
/// from the server after every save (docs/onboarding-lawyer.md):
///
/// ```text
/// licence not confirmed            → license       (state + bar no. + ✓)
/// licence sent or ok, no practices → practices     (save → next stage)
/// licence submitted, under review  → licensePending (continue to the feed)
/// practices ok, no subscription    → subscription  (7 days free / Later)
/// subscription or trial active     → done          (continue)
/// ```
enum AttorneySetupStage {
  license,
  licensePending,
  practices,
  subscription,
  done;

  /// Position in the stepper (licence, practices, finish). Owner
  /// 2026-11-05: the "under review" screen comes after the practices, so
  /// it takes the last number — the numbers never go back.
  int get segment => switch (this) {
        license => 0,
        practices => 1,
        licensePending || subscription || done => 2,
      };

  static const segments = 3;
}

/// The stage for the server state. [hasPractices] / [subscriptionActive]
/// are only consulted once the previous stage is complete (they may be
/// unknown — null — before that).
AttorneySetupStage attorneySetupStage({
  required VerificationView verification,
  bool? hasPractices,
  bool? subscriptionActive,
  bool offerSkipped = false,
}) {
  switch (verification) {
    case VerificationView.start:
    case VerificationView.draft:
    case VerificationView.needsMoreInfo:
    case VerificationView.rejected:
      return AttorneySetupStage.license;
    case VerificationView.pending:
      // Owner 2026-11-05: practice areas are a REQUIRED step of sign-up
      // again. Since 2026-10-16 a licence waits for a registry match or an
      // admin (`verification.self_attestation_auto_approve` off), and the
      // practices — asked only of verified attorneys — silently dropped
      // out of sign-up. Now they are asked right after the licence is
      // sent; the API accepts them from a pending attorney.
      return (hasPractices ?? false)
          ? AttorneySetupStage.licensePending
          : AttorneySetupStage.practices;
    case VerificationView.suspended:
      return AttorneySetupStage.licensePending;
    case VerificationView.verified:
      break;
  }
  if (hasPractices != true) return AttorneySetupStage.practices;
  // Owner 2026-10-05 (audit): "Later" is remembered — Back from the tour
  // doesn't show the offer again.
  if (subscriptionActive != true && !offerSkipped) {
    return AttorneySetupStage.subscription;
  }
  return AttorneySetupStage.done;
}
