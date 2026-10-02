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
      commentsEnabled: json['commentsEnabled'] as bool? ?? true,
      practiceCode: json['practiceCode'] as String?,
      mediaFileIds: (json['mediaFileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      videoAssetId: json['videoAssetId'] as String?,
      location: json['location'] == null
          ? null
          : PostLocationDto.fromJson(json['location'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CreatePostDtoToJson(CreatePostDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'practiceCode': ?instance.practiceCode,
      'kind': instance.kind.toJson(),
      'body': instance.body,
      'mediaFileIds': ?instance.mediaFileIds,
      'videoAssetId': ?instance.videoAssetId,
      'location': ?instance.location?.toJson(),
      'commentsEnabled': instance.commentsEnabled,
    };
