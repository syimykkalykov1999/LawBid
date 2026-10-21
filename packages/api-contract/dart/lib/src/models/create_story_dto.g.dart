// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_story_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateStoryDto _$CreateStoryDtoFromJson(Map<String, dynamic> json) =>
    CreateStoryDto(
      kind: StoryKind.fromJson(json['kind'] as String),
      fileId: json['fileId'] as String?,
      videoAssetId: json['videoAssetId'] as String?,
      text: json['text'] as String?,
      background: json['background'] == null
          ? null
          : CreateStoryDtoBackground.fromJson(json['background'] as String),
      overlays: (json['overlays'] as List<dynamic>?)
          ?.map((e) => StoryOverlayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      audience: json['audience'] == null
          ? null
          : StoryAudience.fromJson(json['audience'] as String),
    );

Map<String, dynamic> _$CreateStoryDtoToJson(CreateStoryDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'fileId': ?instance.fileId,
      'videoAssetId': ?instance.videoAssetId,
      'text': ?instance.text,
      'background': ?instance.background?.toJson(),
      'overlays': ?instance.overlays?.map((e) => e.toJson()).toList(),
      'audience': ?instance.audience?.toJson(),
    };
