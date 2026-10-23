// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'incident_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IncidentDto _$IncidentDtoFromJson(Map<String, dynamic> json) => IncidentDto(
  id: json['id'] as String,
  component: json['component'] as String,
  openedAt: DateTime.parse(json['openedAt'] as String),
  closedAt: json['closedAt'] == null
      ? null
      : DateTime.parse(json['closedAt'] as String),
  detail: json['detail'],
);

Map<String, dynamic> _$IncidentDtoToJson(IncidentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'component': instance.component,
      'openedAt': instance.openedAt.toIso8601String(),
      'closedAt': ?instance.closedAt?.toIso8601String(),
      'detail': ?instance.detail,
    };
