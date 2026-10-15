// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsDto _$AnalyticsDtoFromJson(Map<String, dynamic> json) => AnalyticsDto(
  days: json['days'] as num,
  dau: json['dau'] as num,
  wau: json['wau'] as num,
  mau: json['mau'] as num,
  stickinessPercent: json['stickinessPercent'] as num,
  funnel: (json['funnel'] as List<dynamic>)
      .map((e) => AnalyticsStepDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  retention: AnalyticsRetentionDto.fromJson(
    json['retention'] as Map<String, dynamic>,
  ),
  churn: AnalyticsChurnDto.fromJson(json['churn'] as Map<String, dynamic>),
  daily: (json['daily'] as List<dynamic>)
      .map((e) => AnalyticsDayDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  events: AnalyticsEventsDto.fromJson(json['events'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AnalyticsDtoToJson(AnalyticsDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'dau': instance.dau,
      'wau': instance.wau,
      'mau': instance.mau,
      'stickinessPercent': instance.stickinessPercent,
      'funnel': instance.funnel.map((e) => e.toJson()).toList(),
      'retention': instance.retention.toJson(),
      'churn': instance.churn.toJson(),
      'daily': instance.daily.map((e) => e.toJson()).toList(),
      'events': instance.events.toJson(),
    };
