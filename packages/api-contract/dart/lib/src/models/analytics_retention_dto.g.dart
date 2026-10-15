// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_retention_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsRetentionDto _$AnalyticsRetentionDtoFromJson(
  Map<String, dynamic> json,
) => AnalyticsRetentionDto(
  cohort: json['cohort'] as num,
  d1Percent: json['d1Percent'] as num,
  d7Percent: json['d7Percent'] as num,
);

Map<String, dynamic> _$AnalyticsRetentionDtoToJson(
  AnalyticsRetentionDto instance,
) => <String, dynamic>{
  'cohort': instance.cohort,
  'd1Percent': instance.d1Percent,
  'd7Percent': instance.d7Percent,
};
