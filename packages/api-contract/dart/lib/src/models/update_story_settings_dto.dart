// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'story_audience.dart';

part 'update_story_settings_dto.g.dart';

@JsonSerializable()
class UpdateStorySettingsDto {
  const UpdateStorySettingsDto({this.audience, this.allowReplies});

  factory UpdateStorySettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateStorySettingsDtoFromJson(json);

  final StoryAudience? audience;
  final bool? allowReplies;

  Map<String, Object?> toJson() => _$UpdateStorySettingsDtoToJson(this);
}
