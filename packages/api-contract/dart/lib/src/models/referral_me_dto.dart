// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_invite_dto.dart';
import 'referral_me_dto_texts_language.dart';
import 'referral_reward_dto.dart';
import 'referral_texts_dto.dart';
import 'referred_by_dto.dart';

part 'referral_me_dto.g.dart';

@JsonSerializable()
class ReferralMeDto {
  const ReferralMeDto({
    required this.enabled,
    required this.code,
    required this.shareUrl,
    required this.invited,
    required this.qualified,
    required this.rewarded,
    required this.rewards,
    required this.promotionCreditDays,
    required this.pendingDiscountPercent,
    required this.applyWindowDays,
    required this.canApply,
    required this.inviterReward,
    required this.texts,
    required this.textsLanguage,
    this.referredBy,
  });

  factory ReferralMeDto.fromJson(Map<String, Object?> json) =>
      _$ReferralMeDtoFromJson(json);

  /// Program switched on in the admin.
  final bool enabled;
  final String code;
  final String shareUrl;
  final int invited;

  /// Qualified or rewarded.
  final int qualified;
  final int rewarded;

  /// Latest 50.
  final List<ReferralInviteDto> rewards;
  final ReferredByDto? referredBy;

  /// Free case-promotion days.
  final int promotionCreditDays;

  /// Percent off the first subscription invoice (0 = none).
  final int pendingDiscountPercent;

  /// Days after sign-up.
  final int applyWindowDays;

  /// This user can still enter a code.
  final bool canApply;
  final ReferralRewardDto inviterReward;

  /// Words written in the admin, in the user language (en or ru); shareMessage is ready to send.
  final ReferralTextsDto texts;

  /// Language of `texts`.
  final ReferralMeDtoTextsLanguage textsLanguage;

  Map<String, Object?> toJson() => _$ReferralMeDtoToJson(this);
}
