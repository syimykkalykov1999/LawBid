// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_brief_dto.dart';

part 'story_tray_item_dto.g.dart';

@JsonSerializable()
class StoryTrayItemDto {
  const StoryTrayItemDto({
    required this.user,
    required this.isMe,
    required this.storyCount,
    required this.unseenCount,
    this.latestAt,
  });
  
  factory StoryTrayItemDto.fromJson(Map<String, Object?> json) => _$StoryTrayItemDtoFromJson(json);
  
  final UserBriefDto user;
  final bool isMe;
  final int storyCount;
  final int unseenCount;
  final DateTime? latestAt;

  Map<String, Object?> toJson() => _$StoryTrayItemDtoToJson(this);
}
