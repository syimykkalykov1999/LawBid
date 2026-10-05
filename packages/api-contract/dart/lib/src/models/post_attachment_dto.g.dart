// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_attachment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostAttachmentDto _$PostAttachmentDtoFromJson(Map<String, dynamic> json) =>
    PostAttachmentDto(
      fileId: json['fileId'] as String,
      position: (json['position'] as num).toInt(),
      fileName: json['fileName'] as String,
      mime: json['mime'] as String,
      sizeBytes: (json['sizeBytes'] as num).toInt(),
      url: json['url'] as String,
    );

Map<String, dynamic> _$PostAttachmentDtoToJson(PostAttachmentDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'position': instance.position,
      'fileName': instance.fileName,
      'mime': instance.mime,
      'sizeBytes': instance.sizeBytes,
      'url': instance.url,
    };
