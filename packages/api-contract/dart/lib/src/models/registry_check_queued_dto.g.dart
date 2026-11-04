// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_check_queued_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryCheckQueuedDto _$RegistryCheckQueuedDtoFromJson(
  Map<String, dynamic> json,
) => RegistryCheckQueuedDto(
  licenseId: json['licenseId'] as String,
  checkId: json['checkId'] as String,
  kind: RegistryCheckQueuedDtoKind.fromJson(json['kind'] as String),
  status: RegistryCheckQueuedDtoStatus.fromJson(json['status'] as String),
  queuedAt: DateTime.parse(json['queuedAt'] as String),
);

Map<String, dynamic> _$RegistryCheckQueuedDtoToJson(
  RegistryCheckQueuedDto instance,
) => <String, dynamic>{
  'licenseId': instance.licenseId,
  'checkId': instance.checkId,
  'kind': instance.kind.toJson(),
  'status': instance.status.toJson(),
  'queuedAt': instance.queuedAt.toIso8601String(),
};
