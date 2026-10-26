// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_label_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaLabelDto _$MediaLabelDtoFromJson(Map<String, dynamic> json) =>
    MediaLabelDto(
      name: json['name'] as String,
      parent: json['parent'] as String?,
      confidence: json['confidence'] as num,
    );

Map<String, dynamic> _$MediaLabelDtoToJson(MediaLabelDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'parent': ?instance.parent,
      'confidence': instance.confidence,
    };
