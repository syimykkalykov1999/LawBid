// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referred_by_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferredByDto _$ReferredByDtoFromJson(Map<String, dynamic> json) =>
    ReferredByDto(
      status: ReferralStatus.fromJson(json['status'] as String),
      reward: ReferralRewardDto.fromJson(
        json['reward'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$ReferredByDtoToJson(ReferredByDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'reward': instance.reward.toJson(),
    };
