// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_events_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsEventsDto _$AnalyticsEventsDtoFromJson(Map<String, dynamic> json) =>
    AnalyticsEventsDto(
      enabled: json['enabled'] as bool,
      topEvents: (json['topEvents'] as List<dynamic>)
          .map((e) => AppEventCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      topScreens: (json['topScreens'] as List<dynamic>)
          .map((e) => AppEventCountDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AnalyticsEventsDtoToJson(AnalyticsEventsDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'topEvents': instance.topEvents.map((e) => e.toJson()).toList(),
      'topScreens': instance.topScreens.map((e) => e.toJson()).toList(),
    };
