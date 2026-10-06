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
      contentClass: json['contentClass'] == null
          ? null
          : PostContentClass.fromJson(json['contentClass'] as String),
      mediaFileIds: (json['mediaFileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      attachments: (json['attachments'] as List<dynamic>?)
          ?.map(
            (e) => PostAttachmentInputDto.fromJson(e as Map<String, dynamic>),
          )
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
      'contentClass': ?instance.contentClass?.toJson(),
      'body': instance.body,
      'mediaFileIds': ?instance.mediaFileIds,
      'attachments': ?instance.attachments?.map((e) => e.toJson()).toList(),
      'videoAssetId': ?instance.videoAssetId,
      'location': ?instance.location?.toJson(),
      'commentsEnabled': instance.commentsEnabled,
    };
