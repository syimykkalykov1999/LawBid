// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'audit_log_entry_dto.dart';
import 'response_meta_dto.dart';

part 'audit_log_entry_list_envelope.g.dart';

@JsonSerializable()
class AuditLogEntryListEnvelope {
  const AuditLogEntryListEnvelope({required this.data, this.meta});

  factory AuditLogEntryListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AuditLogEntryListEnvelopeFromJson(json);

  final List<AuditLogEntryDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AuditLogEntryListEnvelopeToJson(this);
}
