// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'scale_extras_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ScaleExtrasDto _$ScaleExtrasDtoFromJson(Map<String, dynamic> json) =>
    ScaleExtrasDto(
      dbAutoscale: ScaleExtrasDtoDbAutoscale.fromJson(
        json['dbAutoscale'] as String,
      ),
      redisAutoscale: ScaleExtrasDtoRedisAutoscale.fromJson(
        json['redisAutoscale'] as String,
      ),
      poolerEnabled: json['poolerEnabled'] as bool,
      poolerMinTasks: json['poolerMinTasks'] as num?,
      poolerMaxTasks: json['poolerMaxTasks'] as num?,
      searchEngine: json['searchEngine'] as String,
    );

Map<String, dynamic> _$ScaleExtrasDtoToJson(ScaleExtrasDto instance) =>
    <String, dynamic>{
      'dbAutoscale': instance.dbAutoscale.toJson(),
      'redisAutoscale': instance.redisAutoscale.toJson(),
      'poolerEnabled': instance.poolerEnabled,
      'poolerMinTasks': ?instance.poolerMinTasks,
      'poolerMaxTasks': ?instance.poolerMaxTasks,
      'searchEngine': instance.searchEngine,
    };
