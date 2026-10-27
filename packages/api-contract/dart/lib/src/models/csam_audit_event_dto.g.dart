// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'csam_audit_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CsamAuditEventDto _$CsamAuditEventDtoFromJson(Map<String, dynamic> json) =>
    CsamAuditEventDto(
      at: DateTime.parse(json['at'] as String),
      event: json['event'] as String,
      actor: json['actor'] as String?,
      detail: json['detail'],
    );

Map<String, dynamic> _$CsamAuditEventDtoToJson(CsamAuditEventDto instance) =>
    <String, dynamic>{
      'at': instance.at.toIso8601String(),
      'event': instance.event,
      'actor': ?instance.actor,
      'detail': ?instance.detail,
    };
