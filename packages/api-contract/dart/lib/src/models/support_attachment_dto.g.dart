// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_attachment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportAttachmentDto _$SupportAttachmentDtoFromJson(
  Map<String, dynamic> json,
) => SupportAttachmentDto(
  id: json['id'] as String,
  name: json['name'] as String,
  mime: json['mime'] as String,
  sizeBytes: json['sizeBytes'] as num,
  isImage: json['isImage'] as bool,
  isVideo: json['isVideo'] as bool,
  url: json['url'] as String?,
  previewUrl: json['previewUrl'] as String?,
  width: json['width'] as num?,
  height: json['height'] as num?,
);

Map<String, dynamic> _$SupportAttachmentDtoToJson(
  SupportAttachmentDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'mime': instance.mime,
  'sizeBytes': instance.sizeBytes,
  'isImage': instance.isImage,
  'isVideo': instance.isVideo,
  'url': ?instance.url,
  'previewUrl': ?instance.previewUrl,
  'width': ?instance.width,
  'height': ?instance.height,
};
