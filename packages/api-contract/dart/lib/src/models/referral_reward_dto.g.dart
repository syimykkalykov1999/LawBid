// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_reward_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralRewardDto _$ReferralRewardDtoFromJson(Map<String, dynamic> json) =>
    ReferralRewardDto(
      type: ReferralRewardType.fromJson(json['type'] as String),
      value: (json['value'] as num).toInt(),
    );

Map<String, dynamic> _$ReferralRewardDtoToJson(ReferralRewardDto instance) =>
    <String, dynamic>{'type': instance.type.toJson(), 'value': instance.value};
