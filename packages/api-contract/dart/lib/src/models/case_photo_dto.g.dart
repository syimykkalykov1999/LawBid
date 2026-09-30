// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_photo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePhotoDto _$CasePhotoDtoFromJson(Map<String, dynamic> json) => CasePhotoDto(
  fileId: json['fileId'] as String,
  url: json['url'] as String,
  previewUrl: json['previewUrl'] as String,
  mime: json['mime'] as String,
  sizeBytes: (json['sizeBytes'] as num).toInt(),
);

Map<String, dynamic> _$CasePhotoDtoToJson(CasePhotoDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'url': instance.url,
      'previewUrl': instance.previewUrl,
      'mime': instance.mime,
      'sizeBytes': instance.sizeBytes,
    };
