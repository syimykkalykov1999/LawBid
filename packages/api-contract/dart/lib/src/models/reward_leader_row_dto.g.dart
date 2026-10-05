// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_leader_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardLeaderRowDto _$RewardLeaderRowDtoFromJson(Map<String, dynamic> json) =>
    RewardLeaderRowDto(
      adminId: json['adminId'] as String,
      name: json['name'] as String,
      rank: json['rank'] as num,
      score: json['score'] as num,
      metrics: (json['metrics'] as List<dynamic>)
          .map((e) => RewardMetricDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$RewardLeaderRowDtoToJson(RewardLeaderRowDto instance) =>
    <String, dynamic>{
      'adminId': instance.adminId,
      'name': instance.name,
      'rank': instance.rank,
      'score': instance.score,
      'metrics': instance.metrics.map((e) => e.toJson()).toList(),
    };
