// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_viewer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryViewerDto _$StoryViewerDtoFromJson(Map<String, dynamic> json) =>
    StoryViewerDto(
      user: UserBriefDto.fromJson(json['user'] as Map<String, dynamic>),
      viewedAt: DateTime.parse(json['viewedAt'] as String),
    );

Map<String, dynamic> _$StoryViewerDtoToJson(StoryViewerDto instance) =>
    <String, dynamic>{
      'user': instance.user.toJson(),
      'viewedAt': instance.viewedAt.toIso8601String(),
    };
