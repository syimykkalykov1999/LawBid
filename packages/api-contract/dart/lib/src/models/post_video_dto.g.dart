// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_video_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostVideoDto _$PostVideoDtoFromJson(Map<String, dynamic> json) => PostVideoDto(
  status: VideoAssetStatus.fromJson(json['status'] as String),
  playbackUrl: json['playbackUrl'] as String?,
  thumbnailUrl: json['thumbnailUrl'] as String?,
  durationSec: (json['durationSec'] as num?)?.toInt(),
  width: (json['width'] as num?)?.toInt(),
  height: (json['height'] as num?)?.toInt(),
);

Map<String, dynamic> _$PostVideoDtoToJson(PostVideoDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'playbackUrl': ?instance.playbackUrl,
      'thumbnailUrl': ?instance.thumbnailUrl,
      'durationSec': ?instance.durationSec,
      'width': ?instance.width,
      'height': ?instance.height,
    };
