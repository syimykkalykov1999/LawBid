import 'package:lawbid/features/verification/application/verification_overview_controller.dart';

/// Owner 2026-10-04: the attorney part of onboarding (`/onboarding/
/// verification`) is ONE linear sequence, each stage shown once and read
/// from the server after every save (docs/onboarding-lawyer.md):
///
/// ```text
/// licence not confirmed            → license       (state + bar no. + ✓)
/// licence submitted, under review  → licensePending (continue to the feed)
/// licence ok, no practice areas    → practices     (save → next stage)
/// practices ok, no subscription    → subscription  (7 days free / Later)
/// subscription or trial active     → done          (continue)
/// ```
enum AttorneySetupStage {
  license,
  licensePending,
  practices,
  subscription,
  done;

  /// Position in the progress bar (licence, practices, subscription).
  int get segment => switch (this) {
        license || licensePending => 0,
        practices => 1,
        subscription || done => 2,
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
