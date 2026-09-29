// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'audit_log_entry_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AuditLogEntryListEnvelope _$AuditLogEntryListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AuditLogEntryListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AuditLogEntryDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AuditLogEntryListEnvelopeToJson(
  AuditLogEntryListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
