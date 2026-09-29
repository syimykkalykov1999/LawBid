// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'audit_log_entry_dto.g.dart';

@JsonSerializable()
class AuditLogEntryDto {
  const AuditLogEntryDto({
    required this.id,
    required this.adminId,
    required this.adminEmail,
    required this.action,
    required this.targetType,
    required this.targetId,
    required this.justification,
    required this.before,
    required this.after,
    required this.ip,
    required this.createdAt,
  });

  factory AuditLogEntryDto.fromJson(Map<String, Object?> json) =>
      _$AuditLogEntryDtoFromJson(json);

  final String id;
  final String adminId;
  final String? adminEmail;
  final String action;
  final String targetType;
  final String? targetId;
  final String? justification;
  final dynamic before;
  final dynamic after;
  final String? ip;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AuditLogEntryDtoToJson(this);
}
