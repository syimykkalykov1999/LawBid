// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'apply_referral_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ApplyReferralResultDto _$ApplyReferralResultDtoFromJson(
  Map<String, dynamic> json,
) => ApplyReferralResultDto(
  status: ReferralStatus.fromJson(json['status'] as String),
  reward: ReferralRewardDto.fromJson(json['reward'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ApplyReferralResultDtoToJson(
  ApplyReferralResultDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'reward': instance.reward.toJson(),
};
