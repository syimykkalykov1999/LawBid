// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'audit_log_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuditLogEntryDto _$AuditLogEntryDtoFromJson(Map<String, dynamic> json) =>
    AuditLogEntryDto(
      id: json['id'] as String,
      adminId: json['adminId'] as String,
      adminEmail: json['adminEmail'] as String?,
      action: json['action'] as String,
      targetType: json['targetType'] as String,
      targetId: json['targetId'] as String?,
      justification: json['justification'] as String?,
      before: json['before'],
      after: json['after'],
      ip: json['ip'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AuditLogEntryDtoToJson(AuditLogEntryDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'adminId': instance.adminId,
      'adminEmail': ?instance.adminEmail,
      'action': instance.action,
      'targetType': instance.targetType,
      'targetId': ?instance.targetId,
      'justification': ?instance.justification,
      'before': ?instance.before,
      'after': ?instance.after,
      'ip': ?instance.ip,
      'createdAt': instance.createdAt.toIso8601String(),
    };
