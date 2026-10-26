// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'heavy_metric_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HeavyMetricDto _$HeavyMetricDtoFromJson(Map<String, dynamic> json) =>
    HeavyMetricDto(
      metric: HeavyMetricDtoMetric.fromJson(json['metric'] as String),
      users: (json['users'] as List<dynamic>)
          .map((e) => HeavyEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      cases: (json['cases'] as List<dynamic>)
          .map((e) => HeavyEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$HeavyMetricDtoToJson(HeavyMetricDto instance) =>
    <String, dynamic>{
      'metric': instance.metric.toJson(),
      'users': instance.users.map((e) => e.toJson()).toList(),
      'cases': instance.cases.map((e) => e.toJson()).toList(),
    };
