// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePostDto _$CreatePostDtoFromJson(Map<String, dynamic> json) =>
    CreatePostDto(
      body: json['body'] as String,
      mediaFileIds: (json['mediaFileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CreatePostDtoToJson(CreatePostDto instance) =>
    <String, dynamic>{
      'body': instance.body,
      'mediaFileIds': ?instance.mediaFileIds,
    };
