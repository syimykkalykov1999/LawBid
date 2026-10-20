// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_brief_dto.dart';

part 'story_viewer_dto.g.dart';

@JsonSerializable()
class StoryViewerDto {
  const StoryViewerDto({required this.user, required this.viewedAt});

  factory StoryViewerDto.fromJson(Map<String, Object?> json) =>
      _$StoryViewerDtoFromJson(json);

  final UserBriefDto user;
  final DateTime viewedAt;

  Map<String, Object?> toJson() => _$StoryViewerDtoToJson(this);
}
