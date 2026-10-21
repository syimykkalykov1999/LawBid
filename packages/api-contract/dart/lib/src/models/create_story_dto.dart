// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_story_dto_background.dart';
import 'story_audience.dart';
import 'story_kind.dart';
import 'story_overlay_dto.dart';

part 'create_story_dto.g.dart';

@JsonSerializable()
class CreateStoryDto {
  const CreateStoryDto({
    required this.kind,
    this.fileId,
    this.videoAssetId,
    this.text,
    this.background,
    this.overlays,
    this.audience,
  });

  factory CreateStoryDto.fromJson(Map<String, Object?> json) =>
      _$CreateStoryDtoFromJson(json);

  final StoryKind kind;

  /// photo: the author's clean `post_image` file.
  final String? fileId;

  /// video: an upload from POST /stories/video-uploads that is ready.
  final String? videoAssetId;

  /// The caption of a photo / video, the whole text of a text story.
  final String? text;
  final CreateStoryDtoBackground? background;
  final List<StoryOverlayDto>? overlays;

  /// Default: the author's privacy setting.
  final StoryAudience? audience;

  Map<String, Object?> toJson() => _$CreateStoryDtoToJson(this);
}
