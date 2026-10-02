// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'video_upload_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VideoUploadDto _$VideoUploadDtoFromJson(Map<String, dynamic> json) =>
    VideoUploadDto(
      videoAssetId: json['videoAssetId'] as String,
      tusEndpoint: json['tusEndpoint'] as String,
      libraryId: json['libraryId'] as String,
      videoId: json['videoId'] as String,
      authorizationSignature: json['authorizationSignature'] as String,
      authorizationExpire: (json['authorizationExpire'] as num).toInt(),
      maxDurationSec: (json['maxDurationSec'] as num).toInt(),
    );

Map<String, dynamic> _$VideoUploadDtoToJson(VideoUploadDto instance) =>
    <String, dynamic>{
      'videoAssetId': instance.videoAssetId,
      'tusEndpoint': instance.tusEndpoint,
      'libraryId': instance.libraryId,
      'videoId': instance.videoId,
      'authorizationSignature': instance.authorizationSignature,
      'authorizationExpire': instance.authorizationExpire,
      'maxDurationSec': instance.maxDurationSec,
    };
