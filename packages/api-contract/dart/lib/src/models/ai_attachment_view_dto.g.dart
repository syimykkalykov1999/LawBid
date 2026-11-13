// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_attachment_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiAttachmentViewDto _$AiAttachmentViewDtoFromJson(Map<String, dynamic> json) =>
    AiAttachmentViewDto(
      id: json['id'] as String,
      mime: json['mime'] as String,
      previewUrl: json['previewUrl'] as String?,
      ready: json['ready'] as bool,
    );

Map<String, dynamic> _$AiAttachmentViewDtoToJson(
  AiAttachmentViewDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'mime': instance.mime,
  'previewUrl': ?instance.previewUrl,
  'ready': instance.ready,
};
