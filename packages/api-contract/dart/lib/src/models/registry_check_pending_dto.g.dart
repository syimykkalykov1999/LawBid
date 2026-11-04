// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_check_pending_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryCheckPendingDto _$RegistryCheckPendingDtoFromJson(
  Map<String, dynamic> json,
) => RegistryCheckPendingDto(
  checkId: json['checkId'] as String,
  kind: RegistryCheckPendingDtoKind.fromJson(json['kind'] as String),
  queuedAt: DateTime.parse(json['queuedAt'] as String),
);

Map<String, dynamic> _$RegistryCheckPendingDtoToJson(
  RegistryCheckPendingDto instance,
) => <String, dynamic>{
  'checkId': instance.checkId,
  'kind': instance.kind.toJson(),
  'queuedAt': instance.queuedAt.toIso8601String(),
};
