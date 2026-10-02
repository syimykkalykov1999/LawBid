// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'content_status.dart';
import 'mention_dto.dart';
import 'post_author_dto.dart';
import 'post_kind.dart';
import 'post_media_dto.dart';
import 'post_practice_dto.dart';
import 'post_video_dto.dart';

part 'post_dto.g.dart';

@JsonSerializable()
class PostDto {
  const PostDto({
    required this.id,
    required this.kind,
    required this.author,
    required this.body,
    required this.media,
    required this.tags,
    required this.mentions,
    required this.status,
    required this.likeCount,
    required this.commentCount,
    required this.saveCount,
    required this.shareCount,
    required this.likedByMe,
    required this.savedByMe,
    required this.isMine,
    required this.createdAt,
    this.title,
    this.practice,
    this.video,
    this.editedAt,
  });

  factory PostDto.fromJson(Map<String, Object?> json) =>
      _$PostDtoFromJson(json);

  final String id;

  /// Owner 2026-09-30; null on older posts (the app splits the body).
  final String? title;
  final PostKind kind;
  final PostPracticeDto? practice;
  final PostAuthorDto author;
  final String body;
  final List<PostMediaDto> media;

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
  final bool likedByMe;
  final bool savedByMe;
  final bool isMine;
  final String createdAt;

  /// "Изменено" (§3.3).
  final String? editedAt;

  Map<String, Object?> toJson() => _$PostDtoToJson(this);
}
