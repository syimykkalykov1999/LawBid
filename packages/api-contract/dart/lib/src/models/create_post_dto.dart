// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_attachment_input_dto.dart';
import 'post_content_class.dart';
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
    this.contentClass,
    this.mediaFileIds,
    this.attachments,
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

  /// Owner 2026-10-05: 'legal' or 'general'. A post with a law topic or.
  /// News is always legal; without one the author picks (default general).
  final PostContentClass? contentClass;
  final String body;

  /// Clean post_image file ids, in display order.
  final List<String>? mediaFileIds;

  /// Owner 2026-10-05: up to 9 documents (PDF, Word, text).
  final List<PostAttachmentInputDto>? attachments;

  /// Owner 2026-10-01: a reel — the uploaded video (POST /videos/uploads).
  /// The post appears once the video is encoded. Owner 2026-10-05: a.
  /// reel's photos and documents form its inner page ("Смотреть").
  final String? videoAssetId;
  final PostLocationDto? location;

  /// Default true; false = nobody can comment.
  final bool commentsEnabled;

  Map<String, Object?> toJson() => _$CreatePostDtoToJson(this);
}
