// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'template_download_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TemplateDownloadDto _$TemplateDownloadDtoFromJson(Map<String, dynamic> json) =>
    TemplateDownloadDto(
      url: json['url'] as String,
      fileName: json['fileName'] as String,
      mime: json['mime'] as String,
      sizeBytes: json['sizeBytes'] as num,
    );

Map<String, dynamic> _$TemplateDownloadDtoToJson(
  TemplateDownloadDto instance,
) => <String, dynamic>{
  'url': instance.url,
  'fileName': instance.fileName,
  'mime': instance.mime,
  'sizeBytes': instance.sizeBytes,
};
