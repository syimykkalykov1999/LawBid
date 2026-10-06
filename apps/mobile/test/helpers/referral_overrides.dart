import 'package:lawbid/features/partners/application/partners_providers.dart';
import 'package:lawbid/features/partners/domain/partner_models.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/referrals/application/referrals_providers.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';

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

/// Settings also asks whether the user is a partner; tests get "not a
/// partner" so no request (and no retry timer) is left behind.
final partnerOffOverride = partnerMeProvider.overrideWith(
  (ref) async => const PartnerMe(
    enabled: false,
    isPartner: false,
    canJoin: false,
    joinMode: 'open',
    status: null,
    code: '',
    shareUrl: '',
    rates: PartnerRates(
      attorneyRateCents: 0,
      clientRateCents: 0,
      monthlyBaseCents: 0,
      clientRule: '',
      holdDays: 0,
    ),
    totals: PartnerTotals(
      heldCents: 0,
      approvedCents: 0,
      paidCents: 0,
      thisMonthCents: 0,
      referredCount: 0,
      qualifiedCount: 0,
    ),
    referred: [],
    commissions: [],
    title: '',
    summary: '',
  ),
);

/// The settings goldens were drawn on a Mac before the document templates
/// row existed; they keep that layout until they are regenerated there.
final templatesOffOverride = templatesEnabledProvider.overrideWithValue(false);

/// Owner 2026-10-05: no promotions yet — Settings hides «Мои продвижения»
/// and nothing goes to the network.
final promotionsOffOverride = myPromotionsProvider.overrideWith(
  (ref) async => const PromotionPage(items: []),
);
