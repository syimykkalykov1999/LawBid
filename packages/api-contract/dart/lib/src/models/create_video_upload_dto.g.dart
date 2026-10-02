// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_video_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateVideoUploadDto _$CreateVideoUploadDtoFromJson(
  Map<String, dynamic> json,
) => CreateVideoUploadDto(
  sizeBytes: (json['sizeBytes'] as num).toInt(),
  durationSec: (json['durationSec'] as num).toInt(),
  title: json['title'] as String?,
);

Map<String, dynamic> _$CreateVideoUploadDtoToJson(
  CreateVideoUploadDto instance,
) => <String, dynamic>{
  'sizeBytes': instance.sizeBytes,
  'durationSec': instance.durationSec,
  'title': ?instance.title,
};
