// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_rewards_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyRewardsDto _$MyRewardsDtoFromJson(Map<String, dynamic> json) => MyRewardsDto(
  enabled: json['enabled'] as bool,
  ranks: (json['ranks'] as List<dynamic>)
      .map((e) => MyRewardRankDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  awards: (json['awards'] as List<dynamic>)
      .map((e) => RewardAwardDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  period: json['period'] as String?,
);

Map<String, dynamic> _$MyRewardsDtoToJson(MyRewardsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'period': ?instance.period,
      'ranks': instance.ranks.map((e) => e.toJson()).toList(),
      'awards': instance.awards.map((e) => e.toJson()).toList(),
    };
