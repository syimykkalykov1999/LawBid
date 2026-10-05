// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_leaderboard_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardLeaderboardDto _$RewardLeaderboardDtoFromJson(
  Map<String, dynamic> json,
) => RewardLeaderboardDto(
  period: json['period'] as String,
  from: DateTime.parse(json['from'] as String),
  to: DateTime.parse(json['to'] as String),
  closed: json['closed'] as bool,
  departments: (json['departments'] as List<dynamic>)
      .map((e) => RewardDepartmentBoardDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$RewardLeaderboardDtoToJson(
  RewardLeaderboardDto instance,
) => <String, dynamic>{
  'period': instance.period,
  'from': instance.from.toIso8601String(),
  'to': instance.to.toIso8601String(),
  'closed': instance.closed,
  'departments': instance.departments.map((e) => e.toJson()).toList(),
};
