// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_video_upload_dto.g.dart';

@JsonSerializable()
class CreateVideoUploadDto {
  const CreateVideoUploadDto({
    required this.sizeBytes,
    required this.durationSec,
    this.title,
    this.trimStartMs,
    this.trimEndMs,
    this.coverTimeMs,
  });

  factory CreateVideoUploadDto.fromJson(Map<String, Object?> json) =>
      _$CreateVideoUploadDtoFromJson(json);

  /// File size.
  final int sizeBytes;

  /// Seconds.
  final int durationSec;
  final String? title;

  /// Owner 2026-10-05: the part of the video the reel plays (trim).
  final int? trimStartMs;
  final int? trimEndMs;

  /// Owner 2026-10-05: the cover = the frame at this moment.
  final int? coverTimeMs;

  Map<String, Object?> toJson() => _$CreateVideoUploadDtoToJson(this);
}
