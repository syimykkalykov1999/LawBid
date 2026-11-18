// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'terminus_health_indicator_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TerminusHealthIndicatorResult _$TerminusHealthIndicatorResultFromJson(
  Map<String, dynamic> json,
) => TerminusHealthIndicatorResult(
  status: TerminusHealthIndicatorResultStatus.fromJson(
    json['status'] as String,
  ),
  responseTime: json['responseTime'] as num?,
  cachedResponse: json['cachedResponse'] as bool?,
);

Map<String, dynamic> _$TerminusHealthIndicatorResultToJson(
  TerminusHealthIndicatorResult instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'responseTime': ?instance.responseTime,
  'cachedResponse': ?instance.cachedResponse,
};
