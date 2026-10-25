// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'split_plan_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SplitPlanDto _$SplitPlanDtoFromJson(Map<String, dynamic> json) => SplitPlanDto(
  fromDb: json['fromDb'] as String,
  toDb: json['toDb'] as String,
  shards: (json['shards'] as List<dynamic>).map((e) => e as num).toList(),
  rows: json['rows'] as num,
  estimatedSeconds: json['estimatedSeconds'] as num,
  readiness: json['readiness'],
);

Map<String, dynamic> _$SplitPlanDtoToJson(SplitPlanDto instance) =>
    <String, dynamic>{
      'fromDb': instance.fromDb,
      'toDb': instance.toDb,
      'shards': instance.shards,
      'rows': instance.rows,
      'estimatedSeconds': instance.estimatedSeconds,
      'readiness': ?instance.readiness,
    };
