// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'info_info.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfoInfo _$InfoInfoFromJson(Map<String, dynamic> json) => InfoInfo(
  status: TerminusHealthIndicatorResultStatus.fromJson(
    json['status'] as String,
  ),
  responseTime: json['responseTime'] as num?,
  cachedResponse: json['cachedResponse'] as bool?,
);

Map<String, dynamic> _$InfoInfoToJson(InfoInfo instance) => <String, dynamic>{
  'status': instance.status.toJson(),
  'responseTime': ?instance.responseTime,
  'cachedResponse': ?instance.cachedResponse,
};
