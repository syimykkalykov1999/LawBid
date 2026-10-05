// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_reward_award_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateRewardAwardDto _$CreateRewardAwardDtoFromJson(
  Map<String, dynamic> json,
) => CreateRewardAwardDto(
  period: json['period'] as String,
  department: CreateRewardAwardDtoDepartment.fromJson(
    json['department'] as String,
  ),
  adminId: json['adminId'] as String,
  prize: json['prize'] as String?,
  bonusCents: json['bonusCents'] as num?,
);

Map<String, dynamic> _$CreateRewardAwardDtoToJson(
  CreateRewardAwardDto instance,
) => <String, dynamic>{
  'period': instance.period,
  'department': instance.department.toJson(),
  'adminId': instance.adminId,
  'prize': ?instance.prize,
  'bonusCents': ?instance.bonusCents,
};
