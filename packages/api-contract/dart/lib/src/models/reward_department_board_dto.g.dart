// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_department_board_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardDepartmentBoardDto _$RewardDepartmentBoardDtoFromJson(
  Map<String, dynamic> json,
) => RewardDepartmentBoardDto(
  key: RewardDepartmentBoardDtoKey.fromJson(json['key'] as String),
  label: json['label'] as String,
  prize: json['prize'] as String,
  bonusCents: json['bonusCents'] as num,
  members: json['members'] as num,
  rows: (json['rows'] as List<dynamic>)
      .map((e) => RewardLeaderRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  award: json['award'] == null
      ? null
      : RewardAwardDto.fromJson(json['award'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RewardDepartmentBoardDtoToJson(
  RewardDepartmentBoardDto instance,
) => <String, dynamic>{
  'key': instance.key.toJson(),
  'label': instance.label,
  'prize': instance.prize,
  'bonusCents': instance.bonusCents,
  'members': instance.members,
  'rows': instance.rows.map((e) => e.toJson()).toList(),
  'award': ?instance.award?.toJson(),
};
