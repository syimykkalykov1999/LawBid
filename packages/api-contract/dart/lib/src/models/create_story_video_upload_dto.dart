// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_story_video_upload_dto.g.dart';

@JsonSerializable()
class CreateStoryVideoUploadDto {
  const CreateStoryVideoUploadDto({
    required this.sizeBytes,
    required this.durationSec,
    this.trimStartMs,
    this.trimEndMs,
  });

  factory CreateStoryVideoUploadDto.fromJson(Map<String, Object?> json) =>
      _$CreateStoryVideoUploadDtoFromJson(json);

  final int sizeBytes;

  /// Seconds.
  final int durationSec;

  /// The part to play (≤ stories.max_video_sec); default: from the start.
  final int? trimStartMs;
  final int? trimEndMs;

  Map<String, Object?> toJson() => _$CreateStoryVideoUploadDtoToJson(this);
}
