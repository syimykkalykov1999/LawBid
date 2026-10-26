// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'status_incident_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StatusIncidentDto _$StatusIncidentDtoFromJson(Map<String, dynamic> json) =>
    StatusIncidentDto(
      id: json['id'] as String,
      component: StatusIncidentDtoComponent.fromJson(
        json['component'] as String,
      ),
      kind: StatusIncidentDtoKind.fromJson(json['kind'] as String),
      titleRu: json['titleRu'] as String,
      titleEn: json['titleEn'] as String,
      messageRu: json['messageRu'] as String,
      messageEn: json['messageEn'] as String,
      startedAt: DateTime.parse(json['startedAt'] as String),
      resolvedAt: json['resolvedAt'] == null
          ? null
          : DateTime.parse(json['resolvedAt'] as String),
    );

Map<String, dynamic> _$StatusIncidentDtoToJson(StatusIncidentDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'component': instance.component.toJson(),
      'kind': instance.kind.toJson(),
      'titleRu': instance.titleRu,
      'titleEn': instance.titleEn,
      'messageRu': instance.messageRu,
      'messageEn': instance.messageEn,
      'startedAt': instance.startedAt.toIso8601String(),
      'resolvedAt': ?instance.resolvedAt?.toIso8601String(),
    };
