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
  trimStartMs: (json['trimStartMs'] as num?)?.toInt(),
  trimEndMs: (json['trimEndMs'] as num?)?.toInt(),
  coverTimeMs: (json['coverTimeMs'] as num?)?.toInt(),
);

Map<String, dynamic> _$CreateVideoUploadDtoToJson(
  CreateVideoUploadDto instance,
) => <String, dynamic>{
  'sizeBytes': instance.sizeBytes,
  'durationSec': instance.durationSec,
  'title': ?instance.title,
  'trimStartMs': ?instance.trimStartMs,
  'trimEndMs': ?instance.trimEndMs,
  'coverTimeMs': ?instance.coverTimeMs,
};
