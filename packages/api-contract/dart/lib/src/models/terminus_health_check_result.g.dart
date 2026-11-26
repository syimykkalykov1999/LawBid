// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'terminus_health_check_result.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TerminusHealthCheckResult _$TerminusHealthCheckResultFromJson(
  Map<String, dynamic> json,
) => TerminusHealthCheckResult(
  status: TerminusHealthCheckResultStatus.fromJson(json['status'] as String),
  details: (json['details'] as Map<String, dynamic>).map(
    (k, e) => MapEntry(k, DetailsDetails.fromJson(e as Map<String, dynamic>)),
  ),
  info: (json['info'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, InfoInfo.fromJson(e as Map<String, dynamic>)),
  ),
  error: (json['error'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, ErrorError.fromJson(e as Map<String, dynamic>)),
  ),
);

Map<String, dynamic> _$TerminusHealthCheckResultToJson(
  TerminusHealthCheckResult instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'info': ?instance.info?.map((k, e) => MapEntry(k, e.toJson())),
  'error': ?instance.error?.map((k, e) => MapEntry(k, e.toJson())),
  'details': instance.details.map((k, e) => MapEntry(k, e.toJson())),
};
