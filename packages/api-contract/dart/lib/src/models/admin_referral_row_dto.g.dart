// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralRowDto _$AdminReferralRowDtoFromJson(Map<String, dynamic> json) =>
    AdminReferralRowDto(
      id: json['id'] as String,
      code: json['code'] as String,
      status: ReferralStatus.fromJson(json['status'] as String),
      referrer: AdminReferralUserDto.fromJson(
        json['referrer'] as Map<String, dynamic>,
      ),
      referee: AdminReferralUserDto.fromJson(
        json['referee'] as Map<String, dynamic>,
      ),
      referrerRole: json['referrerRole'] as String,
      refereeRole: json['refereeRole'] as String,
      referrerReward: ReferralRewardDto.fromJson(
        json['referrerReward'] as Map<String, dynamic>,
      ),
      refereeReward: ReferralRewardDto.fromJson(
        json['refereeReward'] as Map<String, dynamic>,
      ),
      referrerRewardIssued: json['referrerRewardIssued'] as bool,
      refereeRewardIssued: json['refereeRewardIssued'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
      qualifiedAt: json['qualifiedAt'] == null
          ? null
          : DateTime.parse(json['qualifiedAt'] as String),
      rewardedAt: json['rewardedAt'] == null
          ? null
          : DateTime.parse(json['rewardedAt'] as String),
      rejectedReason: json['rejectedReason'] as String?,
    );

Map<String, dynamic> _$AdminReferralRowDtoToJson(
  AdminReferralRowDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'code': instance.code,
  'status': instance.status.toJson(),
  'referrer': instance.referrer.toJson(),
  'referee': instance.referee.toJson(),
  'referrerRole': instance.referrerRole,
  'refereeRole': instance.refereeRole,
  'referrerReward': instance.referrerReward.toJson(),
  'refereeReward': instance.refereeReward.toJson(),
  'referrerRewardIssued': instance.referrerRewardIssued,
  'refereeRewardIssued': instance.refereeRewardIssued,
  'qualifiedAt': ?instance.qualifiedAt?.toIso8601String(),
  'rewardedAt': ?instance.rewardedAt?.toIso8601String(),
  'rejectedReason': ?instance.rejectedReason,
  'createdAt': instance.createdAt.toIso8601String(),
};
