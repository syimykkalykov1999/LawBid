// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tag_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TagDto _$TagDtoFromJson(Map<String, dynamic> json) =>
    TagDto(tag: json['tag'] as String, postsCount: json['postsCount'] as num?);

Map<String, dynamic> _$TagDtoToJson(TagDto instance) => <String, dynamic>{
  'tag': instance.tag,
  'postsCount': ?instance.postsCount,
};
