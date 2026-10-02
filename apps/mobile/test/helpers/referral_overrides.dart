import 'package:lawbid/features/referrals/application/referrals_providers.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';

/// Settings watches the referral program flag; widget tests never hit the
/// network, so they get "program off".
final referralOffOverride = referralMeProvider.overrideWith(
  (ref) async => const ReferralMe(
    enabled: false,
    code: '',
    shareUrl: '',
    invited: 0,
    qualified: 0,
    rewarded: 0,
    invites: [],
    promotionCreditDays: 0,
    pendingDiscountPercent: 0,
    applyWindowDays: 0,
    canApply: false,
    inviterReward: Reward(type: RewardType.unknown, value: 0),
  ),
);
