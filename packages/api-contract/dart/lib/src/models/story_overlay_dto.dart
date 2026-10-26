// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'story_overlay_dto.g.dart';

@JsonSerializable()
class StoryOverlayDto {
  const StoryOverlayDto({
    required this.emoji,
    required this.x,
    required this.y,
    required this.scale,
    required this.rotation,
  });

  factory StoryOverlayDto.fromJson(Map<String, Object?> json) =>
      _$StoryOverlayDtoFromJson(json);

  final String emoji;
  final num x;
  final num y;
  final num scale;

  /// Radians.
  final num rotation;

  Map<String, Object?> toJson() => _$StoryOverlayDtoToJson(this);
}
