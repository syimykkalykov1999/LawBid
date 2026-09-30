// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'comment_author_dto.dart';

part 'case_comment_dto.g.dart';

@JsonSerializable()
class CaseCommentDto {
  const CaseCommentDto({
    required this.id,
    required this.caseId,
    required this.author,
    required this.byCaseOwner,
    required this.body,
    required this.likeCount,
    required this.replyCount,
    required this.likedByMe,
    required this.canDelete,
    required this.isMine,
    required this.createdAt,
    this.parentCommentId,
  });

  factory CaseCommentDto.fromJson(Map<String, Object?> json) =>
      _$CaseCommentDtoFromJson(json);

  final String id;
  final String caseId;
  final String? parentCommentId;
  final CommentAuthorDto author;

  /// Written by the client who owns the case.
  final bool byCaseOwner;
  final String body;
  final int likeCount;
  final int replyCount;
  final bool likedByMe;

  /// Own comment, or any comment on own case.
  final bool canDelete;
  final bool isMine;
  final String createdAt;

  Map<String, Object?> toJson() => _$CaseCommentDtoToJson(this);
}
