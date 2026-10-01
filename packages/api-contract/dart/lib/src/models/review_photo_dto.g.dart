// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_photo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewPhotoDto _$ReviewPhotoDtoFromJson(Map<String, dynamic> json) =>
    ReviewPhotoDto(
      fileId: json['fileId'] as String,
      url: json['url'] as String,
      previewUrl: json['previewUrl'] as String,
    );

Map<String, dynamic> _$ReviewPhotoDtoToJson(ReviewPhotoDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'url': instance.url,
      'previewUrl': instance.previewUrl,
    };
