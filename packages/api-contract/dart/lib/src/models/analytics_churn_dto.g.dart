// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'analytics_churn_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnalyticsChurnDto _$AnalyticsChurnDtoFromJson(Map<String, dynamic> json) =>
    AnalyticsChurnDto(
      clients: AnalyticsChurnPartDto.fromJson(
        json['clients'] as Map<String, dynamic>,
      ),
      attorneys: AnalyticsChurnPartDto.fromJson(
        json['attorneys'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$AnalyticsChurnDtoToJson(AnalyticsChurnDto instance) =>
    <String, dynamic>{
      'clients': instance.clients.toJson(),
      'attorneys': instance.attorneys.toJson(),
    };
