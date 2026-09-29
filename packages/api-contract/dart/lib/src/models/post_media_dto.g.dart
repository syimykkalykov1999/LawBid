// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_media_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostMediaDto _$PostMediaDtoFromJson(Map<String, dynamic> json) => PostMediaDto(
  fileId: json['fileId'] as String,
  position: (json['position'] as num).toInt(),
  url: json['url'] as String,
  previewUrl: json['previewUrl'] as String,
  mediumUrl: json['mediumUrl'] as String,
  width: (json['width'] as num?)?.toInt(),
  height: (json['height'] as num?)?.toInt(),
);

Map<String, dynamic> _$PostMediaDtoToJson(PostMediaDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'position': instance.position,
      'width': ?instance.width,
      'height': ?instance.height,
      'url': instance.url,
      'previewUrl': instance.previewUrl,
      'mediumUrl': instance.mediumUrl,
    };
