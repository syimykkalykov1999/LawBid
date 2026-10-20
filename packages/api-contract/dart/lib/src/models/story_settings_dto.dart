// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'story_audience.dart';

part 'story_settings_dto.g.dart';

@JsonSerializable()
class StorySettingsDto {
  const StorySettingsDto({
    required this.audience,
    required this.allowReplies,
    required this.hiddenCount,
  });

  factory StorySettingsDto.fromJson(Map<String, Object?> json) =>
      _$StorySettingsDtoFromJson(json);

  final StoryAudience audience;
  final bool allowReplies;

  /// People my stories are hidden from.
  final int hiddenCount;

  Map<String, Object?> toJson() => _$StorySettingsDtoToJson(this);
}
