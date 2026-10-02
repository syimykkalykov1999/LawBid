// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralMeDto _$ReferralMeDtoFromJson(Map<String, dynamic> json) =>
    ReferralMeDto(
      enabled: json['enabled'] as bool,
      code: json['code'] as String,
      shareUrl: json['shareUrl'] as String,
      invited: (json['invited'] as num).toInt(),
      qualified: (json['qualified'] as num).toInt(),
      rewarded: (json['rewarded'] as num).toInt(),
      rewards: (json['rewards'] as List<dynamic>)
          .map((e) => ReferralInviteDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      promotionCreditDays: (json['promotionCreditDays'] as num).toInt(),
      pendingDiscountPercent: (json['pendingDiscountPercent'] as num).toInt(),
      applyWindowDays: (json['applyWindowDays'] as num).toInt(),
      canApply: json['canApply'] as bool,
      inviterReward: ReferralRewardDto.fromJson(
        json['inviterReward'] as Map<String, dynamic>,
      ),
      referredBy: json['referredBy'] == null
          ? null
          : ReferredByDto.fromJson(json['referredBy'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReferralMeDtoToJson(ReferralMeDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'code': instance.code,
      'shareUrl': instance.shareUrl,
      'invited': instance.invited,
      'qualified': instance.qualified,
      'rewarded': instance.rewarded,
      'rewards': instance.rewards.map((e) => e.toJson()).toList(),
      'referredBy': ?instance.referredBy?.toJson(),
      'promotionCreditDays': instance.promotionCreditDays,
      'pendingDiscountPercent': instance.pendingDiscountPercent,
      'applyWindowDays': instance.applyWindowDays,
      'canApply': instance.canApply,
      'inviterReward': instance.inviterReward.toJson(),
    };
