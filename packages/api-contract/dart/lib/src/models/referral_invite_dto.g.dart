// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralInviteDto _$ReferralInviteDtoFromJson(Map<String, dynamic> json) =>
    ReferralInviteDto(
      id: json['id'] as String,
      status: ReferralStatus.fromJson(json['status'] as String),
      refereeRole: ReferralInviteDtoRefereeRole.fromJson(
        json['refereeRole'] as String,
      ),
      reward: ReferralRewardDto.fromJson(
        json['reward'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String),
      qualifiedAt: json['qualifiedAt'] == null
          ? null
          : DateTime.parse(json['qualifiedAt'] as String),
      rewardedAt: json['rewardedAt'] == null
          ? null
          : DateTime.parse(json['rewardedAt'] as String),
    );

Map<String, dynamic> _$ReferralInviteDtoToJson(ReferralInviteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'refereeRole': instance.refereeRole.toJson(),
      'reward': instance.reward.toJson(),
      'createdAt': instance.createdAt.toIso8601String(),
      'qualifiedAt': ?instance.qualifiedAt?.toIso8601String(),
      'rewardedAt': ?instance.rewardedAt?.toIso8601String(),
    };
