import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-02 — `/referrals/me` and `/referrals/apply`.
class ReferralsRepository {
  ReferralsRepository(Dio dio) : _api = api.ReferralsClient(dio);

  final api.ReferralsClient _api;

  Future<ReferralMe> me() async {
    final d = (await guardApiCall(_api.getMyReferrals)).data;
    return ReferralMe(
      enabled: d.enabled,
      code: d.code,
      shareUrl: d.shareUrl,
      invited: d.invited,
      qualified: d.qualified,
      rewarded: d.rewarded,
      invites: [
        for (final r in d.rewards)
          ReferralInvite(
            status: r.status.json ?? 'pending',
            refereeIsAttorney:
                r.refereeRole == api.ReferralInviteDtoRefereeRole.attorney,
            reward: _reward(r.reward),
            createdAt: r.createdAt,
          ),
      ],
      promotionCreditDays: d.promotionCreditDays,
      pendingDiscountPercent: d.pendingDiscountPercent,
      applyWindowDays: d.applyWindowDays,
      canApply: d.canApply,
      inviterReward: _reward(d.inviterReward),
      title: d.texts.title.trim(),
      summary: d.texts.summary.trim(),
      terms: d.texts.terms.trim(),
      shareMessage: d.texts.shareMessage.trim(),
      referredByStatus: d.referredBy?.status.json,
      referredByReward:
          d.referredBy == null ? null : _reward(d.referredBy!.reward),
    );
  }

  /// Enters a friend's code. Throws REFERRAL_CODE_INVALID /
  /// REFERRAL_NOT_ALLOWED (details.reason).
  Future<Reward> apply(String code) async => _reward(
        (await guardApiCall(
          () => _api.applyReferral(body: api.ApplyReferralDto(code: code)),
        ))
            .data
            .reward,
      );

  static Reward _reward(api.ReferralRewardDto d) =>
      Reward(type: RewardType.parse(d.type.json), value: d.value);
}
