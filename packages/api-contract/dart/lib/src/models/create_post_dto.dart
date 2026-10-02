// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_kind.dart';
import 'post_location_dto.dart';

part 'create_post_dto.g.dart';

@JsonSerializable()
class CreatePostDto {
  const CreatePostDto({
    required this.title,
    required this.body,
    this.kind = PostKind.post,
    this.commentsEnabled = true,
    this.practiceCode,
    this.mediaFileIds,
    this.videoAssetId,
    this.location,
  });

  factory CreatePostDto.fromJson(Map<String, Object?> json) =>
      _$CreatePostDtoFromJson(json);

  /// Owner 2026-09-30: the card's title.
  final String title;

  /// Owner 2026-09-30: the qualification — a practice category or.
  /// subcategory code (`civil_litigation`, `civil_litigation.appeals`…).
  final String? practiceCode;

  /// Owner 2026-09-30: News — attorneys only.
  final PostKind kind;
  final String body;

  /// Clean post_image file ids, in display order.
  final List<String>? mediaFileIds;

  /// Owner 2026-10-01: a reel — the uploaded video (POST /videos/uploads).
  /// Instead of photos; the post appears once the video is encoded.
  final String? videoAssetId;
  final PostLocationDto? location;

  /// Default true; false = nobody can comment.
  final bool commentsEnabled;

  Map<String, Object?> toJson() => _$CreatePostDtoToJson(this);
}
