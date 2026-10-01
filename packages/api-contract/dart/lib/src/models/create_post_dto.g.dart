// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePostDto _$CreatePostDtoFromJson(Map<String, dynamic> json) =>
    CreatePostDto(
      title: json['title'] as String,
      body: json['body'] as String,
      kind: json['kind'] == null
          ? PostKind.post
          : PostKind.fromJson(json['kind'] as String),
      practiceCode: json['practiceCode'] as String?,
      mediaFileIds: (json['mediaFileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CreatePostDtoToJson(CreatePostDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'practiceCode': ?instance.practiceCode,
      'kind': instance.kind.toJson(),
      'body': instance.body,
      'mediaFileIds': ?instance.mediaFileIds,
    };
