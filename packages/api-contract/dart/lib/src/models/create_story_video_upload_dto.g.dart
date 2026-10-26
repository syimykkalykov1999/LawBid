// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_story_video_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateStoryVideoUploadDto _$CreateStoryVideoUploadDtoFromJson(
  Map<String, dynamic> json,
) => CreateStoryVideoUploadDto(
  sizeBytes: (json['sizeBytes'] as num).toInt(),
  durationSec: (json['durationSec'] as num).toInt(),
  trimStartMs: (json['trimStartMs'] as num?)?.toInt(),
  trimEndMs: (json['trimEndMs'] as num?)?.toInt(),
);

Map<String, dynamic> _$CreateStoryVideoUploadDtoToJson(
  CreateStoryVideoUploadDto instance,
) => <String, dynamic>{
  'sizeBytes': instance.sizeBytes,
  'durationSec': instance.durationSec,
  'trimStartMs': ?instance.trimStartMs,
  'trimEndMs': ?instance.trimEndMs,
};
