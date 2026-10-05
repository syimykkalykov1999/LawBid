// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_template_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTemplateUploadDto _$AdminTemplateUploadDtoFromJson(
  Map<String, dynamic> json,
) => AdminTemplateUploadDto(
  mime: AdminTemplateUploadDtoMime.fromJson(json['mime'] as String),
  sizeBytes: json['sizeBytes'] as num,
  sha256: json['sha256'] as String,
);

Map<String, dynamic> _$AdminTemplateUploadDtoToJson(
  AdminTemplateUploadDto instance,
) => <String, dynamic>{
  'mime': instance.mime.toJson(),
  'sizeBytes': instance.sizeBytes,
  'sha256': instance.sha256,
};
