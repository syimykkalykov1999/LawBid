// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_media_dto.g.dart';

@JsonSerializable()
class PostMediaDto {
  const PostMediaDto({
    required this.fileId,
    required this.position,
    required this.url,
    required this.previewUrl,
    required this.mediumUrl,
    this.width,
    this.height,
    this.blurhash,
  });

  factory PostMediaDto.fromJson(Map<String, Object?> json) =>
      _$PostMediaDtoFromJson(json);

  final String fileId;
  final int position;
  final int? width;
  final int? height;

  /// Full size (≤ 2048 px), signed link.
  final String url;

  /// 320 px preview.
  final String previewUrl;

  /// 1080 px medium.
  final String mediumUrl;

  /// BlurHash (4x3) placeholder shown while the photo loads.
  final String? blurhash;

  Map<String, Object?> toJson() => _$PostMediaDtoToJson(this);
}
