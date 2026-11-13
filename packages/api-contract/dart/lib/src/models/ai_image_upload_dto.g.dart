// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_image_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiImageUploadDto _$AiImageUploadDtoFromJson(Map<String, dynamic> json) =>
    AiImageUploadDto(
      mime: AiImageMime.fromJson(json['mime'] as String),
      sizeBytes: json['sizeBytes'] as num,
      sha256: json['sha256'] as String,
    );

Map<String, dynamic> _$AiImageUploadDtoToJson(AiImageUploadDto instance) =>
    <String, dynamic>{
      'mime': instance.mime.toJson(),
      'sizeBytes': instance.sizeBytes,
      'sha256': instance.sha256,
    };
