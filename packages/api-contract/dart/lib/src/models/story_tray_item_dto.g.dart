// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_tray_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryTrayItemDto _$StoryTrayItemDtoFromJson(Map<String, dynamic> json) =>
    StoryTrayItemDto(
      user: UserBriefDto.fromJson(json['user'] as Map<String, dynamic>),
      isMe: json['isMe'] as bool,
      storyCount: (json['storyCount'] as num).toInt(),
      unseenCount: (json['unseenCount'] as num).toInt(),
      latestAt: json['latestAt'] == null
          ? null
          : DateTime.parse(json['latestAt'] as String),
    );

Map<String, dynamic> _$StoryTrayItemDtoToJson(StoryTrayItemDto instance) =>
    <String, dynamic>{
      'user': instance.user.toJson(),
      'isMe': instance.isMe,
      'storyCount': instance.storyCount,
      'unseenCount': instance.unseenCount,
      'latestAt': ?instance.latestAt?.toIso8601String(),
    };
