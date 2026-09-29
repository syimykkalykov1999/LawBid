// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'data_access_log_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DataAccessLogEntryDto _$DataAccessLogEntryDtoFromJson(
  Map<String, dynamic> json,
) => DataAccessLogEntryDto(
  id: json['id'] as String,
  adminId: json['adminId'] as String,
  entityType: json['entityType'] as String,
  entityId: json['entityId'] as String,
  accessedAt: DateTime.parse(json['accessedAt'] as String),
);

Map<String, dynamic> _$DataAccessLogEntryDtoToJson(
  DataAccessLogEntryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'adminId': instance.adminId,
  'entityType': instance.entityType,
  'entityId': instance.entityId,
  'accessedAt': instance.accessedAt.toIso8601String(),
};
