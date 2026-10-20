// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryDto _$StoryDtoFromJson(Map<String, dynamic> json) => StoryDto(
  id: json['id'] as String,
  author: UserBriefDto.fromJson(json['author'] as Map<String, dynamic>),
  kind: StoryKind.fromJson(json['kind'] as String),
  overlays: (json['overlays'] as List<dynamic>)
      .map((e) => StoryOverlayDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  audience: StoryAudience.fromJson(json['audience'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  expiresAt: DateTime.parse(json['expiresAt'] as String),
  viewedByMe: json['viewedByMe'] as bool,
  isMine: json['isMine'] as bool,
  viewCount: (json['viewCount'] as num).toInt(),
  canReply: json['canReply'] as bool,
  mediaUrl: json['mediaUrl'] as String?,
  previewUrl: json['previewUrl'] as String?,
  video: json['video'] == null
      ? null
      : PostVideoDto.fromJson(json['video'] as Map<String, dynamic>),
  text: json['text'] as String?,
  background: json['background'] as String?,
);

Map<String, dynamic> _$StoryDtoToJson(StoryDto instance) => <String, dynamic>{
  'id': instance.id,
  'author': instance.author.toJson(),
  'kind': instance.kind.toJson(),
  'mediaUrl': ?instance.mediaUrl,
  'previewUrl': ?instance.previewUrl,
  'video': ?instance.video?.toJson(),
  'text': ?instance.text,
  'background': ?instance.background,
  'overlays': instance.overlays.map((e) => e.toJson()).toList(),
  'audience': instance.audience.toJson(),
  'createdAt': instance.createdAt.toIso8601String(),
  'expiresAt': instance.expiresAt.toIso8601String(),
  'viewedByMe': instance.viewedByMe,
  'isMine': instance.isMine,
  'viewCount': instance.viewCount,
  'canReply': instance.canReply,
};
