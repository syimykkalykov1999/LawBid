// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'tag_dto.g.dart';

@JsonSerializable()
class TagDto {
  const TagDto({
    required this.tag,
    this.postsCount,
    this.categoryCode,
    this.coverUrl,
    this.coverPostId,
  });

  factory TagDto.fromJson(Map<String, Object?> json) => _$TagDtoFromJson(json);

  /// Lowercase, without "#".
  final String tag;

  /// Posts in the last 7 days (trending only).
  final num? postsCount;

  /// Practice category its posts mostly belong to (for the topic cover).
  final String? categoryCode;

  /// Owner 2026-11-04 (R-406): cover of a hashtag topic — the photo or video frame of its most popular post (90 days, nightly snapshot); null when the topic has no media posts.
  final String? coverUrl;

  /// The post the cover comes from.
  final String? coverPostId;

  Map<String, Object?> toJson() => _$TagDtoToJson(this);
}
