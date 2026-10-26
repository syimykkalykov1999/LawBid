// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportUploadDto _$AdminSupportUploadDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportUploadDto(
  mime: AdminSupportUploadDtoMime.fromJson(json['mime'] as String),
  sizeBytes: json['sizeBytes'] as num,
  sha256: json['sha256'] as String,
);

Map<String, dynamic> _$AdminSupportUploadDtoToJson(
  AdminSupportUploadDto instance,
) => <String, dynamic>{
  'mime': instance.mime.toJson(),
  'sizeBytes': instance.sizeBytes,
  'sha256': instance.sha256,
};
