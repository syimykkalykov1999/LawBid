// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_attachment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChatAttachmentDto _$ChatAttachmentDtoFromJson(Map<String, dynamic> json) =>
    ChatAttachmentDto(
      fileId: json['fileId'] as String,
      name: json['name'] as String,
      isImage: json['isImage'] as bool,
      mime: json['mime'] as String?,
      sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
      url: json['url'] as String?,
      previewUrl: json['previewUrl'] as String?,
      width: (json['width'] as num?)?.toInt(),
      height: (json['height'] as num?)?.toInt(),
    );

Map<String, dynamic> _$ChatAttachmentDtoToJson(ChatAttachmentDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'name': instance.name,
      'mime': ?instance.mime,
      'sizeBytes': ?instance.sizeBytes,
      'isImage': instance.isImage,
      'url': ?instance.url,
      'previewUrl': ?instance.previewUrl,
      'width': ?instance.width,
      'height': ?instance.height,
    };
