// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'content_status.dart';
import 'mention_dto.dart';
import 'post_attachment_dto.dart';
import 'post_author_dto.dart';
import 'post_content_class.dart';
import 'post_kind.dart';
import 'post_location_dto.dart';
import 'post_media_dto.dart';
import 'post_practice_dto.dart';
import 'post_video_dto.dart';

part 'post_dto.g.dart';

@JsonSerializable()
class PostDto {
  const PostDto({
    required this.id,
    required this.kind,
    required this.contentClass,
    required this.author,
    required this.body,
    required this.media,
    required this.attachments,
    required this.tags,
    required this.mentions,
    required this.status,
    required this.likeCount,
    required this.commentCount,
    required this.saveCount,
    required this.shareCount,
    required this.repostCount,
    required this.likedByMe,
    required this.repostedByMe,
    required this.savedByMe,
    required this.isMine,
    required this.createdAt,
    this.commentsEnabled = true,
    this.location,
    this.title,
    this.practice,
    this.video,
    this.editedAt,
    this.promotionId,
  });

  factory PostDto.fromJson(Map<String, Object?> json) =>
      _$PostDtoFromJson(json);

  final String id;
  final PostLocationDto? location;
  final bool commentsEnabled;

  /// Owner 2026-09-30; null on older posts (the app splits the body).
  final String? title;
  final PostKind kind;
  final PostPracticeDto? practice;

  /// Owner 2026-10-05: legal or general (personal) post.
  final PostContentClass contentClass;
  final PostAuthorDto author;
  final String body;
  final List<PostMediaDto> media;

  /// Owner 2026-10-05: documents (reels: on the inner page).
  final List<PostAttachmentDto> attachments;

  /// Owner 2026-10-01: a reel's video (null for photo/text posts).
  final PostVideoDto? video;

  /// Hashtags without #, lowercase.
  final List<String> tags;

  /// OQ-042: people @mentioned in the text.
  final List<MentionDto> mentions;
  final ContentStatus status;
  final int likeCount;
  final int commentCount;
  final int saveCount;

  /// OQ-037.
  final int shareCount;

  /// Owner 2026-10-07: Threads-style reposts.
  final int repostCount;
  final bool likedByMe;
  final bool repostedByMe;
  final bool savedByMe;
  final bool isMine;
  final String createdAt;

  /// "Изменено" (§3.3).
  final String? editedAt;

  /// Owner 2026-10-05: set on a paid promoted post in the feed — the app.
  /// shows «Реклама» and reports the open to POST /promotions/:id/click.
  final String? promotionId;

  Map<String, Object?> toJson() => _$PostDtoToJson(this);
}
