// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_status_incident_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostStatusIncidentDto _$PostStatusIncidentDtoFromJson(
  Map<String, dynamic> json,
) => PostStatusIncidentDto(
  component: PostStatusIncidentDtoComponent.fromJson(
    json['component'] as String,
  ),
  kind: PostStatusIncidentDtoKind.fromJson(json['kind'] as String),
  titleRu: json['titleRu'] as String,
  titleEn: json['titleEn'] as String?,
  messageRu: json['messageRu'] as String?,
  messageEn: json['messageEn'] as String?,
);

Map<String, dynamic> _$PostStatusIncidentDtoToJson(
  PostStatusIncidentDto instance,
) => <String, dynamic>{
  'component': instance.component.toJson(),
  'kind': instance.kind.toJson(),
  'titleRu': instance.titleRu,
  'titleEn': ?instance.titleEn,
  'messageRu': ?instance.messageRu,
  'messageEn': ?instance.messageEn,
};
