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
    this.thumbnailUrl,
    this.durationSec,
    this.width,
    this.height,
  });

  factory PostVideoDto.fromJson(Map<String, Object?> json) =>
      _$PostVideoDtoFromJson(json);

  final VideoAssetStatus status;
  final String? playbackUrl;
  final String? thumbnailUrl;
  final int? durationSec;
  final int? width;
  final int? height;

  Map<String, Object?> toJson() => _$PostVideoDtoToJson(this);
}
