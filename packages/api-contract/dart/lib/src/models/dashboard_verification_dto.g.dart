// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dashboard_verification_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DashboardVerificationDto _$DashboardVerificationDtoFromJson(
  Map<String, dynamic> json,
) => DashboardVerificationDto(
  queueSize: (json['queueSize'] as num).toInt(),
  oldestAgeSeconds: (json['oldestAgeSeconds'] as num?)?.toInt(),
);

Map<String, dynamic> _$DashboardVerificationDtoToJson(
  DashboardVerificationDto instance,
) => <String, dynamic>{
  'queueSize': instance.queueSize,
  'oldestAgeSeconds': ?instance.oldestAgeSeconds,
};
