// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'video_asset_status.dart';

part 'post_video_dto.g.dart';

@JsonSerializable()
class PostVideoDto {
  const PostVideoDto({
    required this.status,
    this.playbackUrl,
    this.fallbackUrl,
    this.thumbnailUrl,
    this.durationSec,
    this.width,
    this.height,
    this.trimStartMs,
    this.trimEndMs,
  });
  
  factory PostVideoDto.fromJson(Map<String, Object?> json) => _$PostVideoDtoFromJson(json);
  
  final VideoAssetStatus status;
  final String? playbackUrl;

  /// Owner 2026-10-15 (web): the same video as a plain MP4 (Bunny's «MP4.
  /// fallback», 720p). A browser plays it without an HLS library; the phone.
  /// apps keep using [playbackUrl]. Null when the library has no MP4 copy.
  final String? fallbackUrl;
  final String? thumbnailUrl;
  final int? durationSec;
  final int? width;
  final int? height;

  /// Owner 2026-10-05: play only from here…
  final int? trimStartMs;

  /// …to here (null = to the end).
  final int? trimEndMs;

  Map<String, Object?> toJson() => _$PostVideoDtoToJson(this);
}
