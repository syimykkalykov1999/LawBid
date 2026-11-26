// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'error_error.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ErrorError _$ErrorErrorFromJson(Map<String, dynamic> json) => ErrorError(
  status: TerminusHealthIndicatorResultStatus.fromJson(
    json['status'] as String,
  ),
  responseTime: json['responseTime'] as num?,
  cachedResponse: json['cachedResponse'] as bool?,
);

Map<String, dynamic> _$ErrorErrorToJson(ErrorError instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'responseTime': ?instance.responseTime,
      'cachedResponse': ?instance.cachedResponse,
    };
