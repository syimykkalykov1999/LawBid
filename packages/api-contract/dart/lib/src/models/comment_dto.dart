// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'comment_author_dto.dart';

part 'comment_dto.g.dart';

@JsonSerializable()
class CommentDto {
  const CommentDto({
    required this.id,
    required this.postId,
    required this.author,
    required this.body,
    required this.likeCount,
    required this.replyCount,
    required this.likedByMe,
    required this.canDelete,
    required this.isMine,
    required this.createdAt,
    this.parentCommentId,
  });

  factory CommentDto.fromJson(Map<String, Object?> json) =>
      _$CommentDtoFromJson(json);

  final String id;
  final String postId;
  final String? parentCommentId;
  final CommentAuthorDto author;
  final String body;
  final int likeCount;
  final int replyCount;
  final bool likedByMe;

  /// Own comment, or a comment under own post.
  final bool canDelete;
  final bool isMine;
  final String createdAt;

  Map<String, Object?> toJson() => _$CommentDtoToJson(this);
}
