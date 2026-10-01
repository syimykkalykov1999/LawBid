// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_version_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationVersionDto _$IntegrationVersionDtoFromJson(
  Map<String, dynamic> json,
) => IntegrationVersionDto(
  id: json['id'] as String,
  version: json['version'] as num,
  status: IntegrationVersionDtoStatus.fromJson(json['status'] as String),
  masked: Map<String, String>.from(json['masked'] as Map),
  fingerprint: json['fingerprint'] as String,
  createdAt: json['createdAt'] as String,
  activatedAt: json['activatedAt'] as String?,
  lastTestAt: json['lastTestAt'] as String?,
  lastTestOk: json['lastTestOk'] as bool?,
  lastTestError: json['lastTestError'] as String?,
);

Map<String, dynamic> _$IntegrationVersionDtoToJson(
  IntegrationVersionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'version': instance.version,
  'status': instance.status.toJson(),
  'masked': instance.masked,
  'fingerprint': instance.fingerprint,
  'createdAt': instance.createdAt,
  'activatedAt': ?instance.activatedAt,
  'lastTestAt': ?instance.lastTestAt,
  'lastTestOk': ?instance.lastTestOk,
  'lastTestError': ?instance.lastTestError,
};
