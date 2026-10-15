// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsStepDto _$AnalyticsStepDtoFromJson(Map<String, dynamic> json) =>
    AnalyticsStepDto(
      key: AnalyticsStepDtoKey.fromJson(json['key'] as String),
      count: json['count'] as num,
    );

Map<String, dynamic> _$AnalyticsStepDtoToJson(AnalyticsStepDto instance) =>
    <String, dynamic>{'key': instance.key.toJson(), 'count': instance.count};
