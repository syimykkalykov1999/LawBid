// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_comment_row_dto_status.dart';
import 'admin_comment_row_dto_thread.dart';

part 'admin_comment_row_dto.g.dart';

@JsonSerializable()
class AdminCommentRowDto {
  const AdminCommentRowDto({
    required this.id,
    required this.thread,
    required this.targetId,
    required this.body,
    required this.authorId,
    required this.authorName,
    required this.status,
    required this.deleted,
    required this.createdAt,
    this.targetTitle,
  });

  factory AdminCommentRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminCommentRowDtoFromJson(json);

  final String id;
  final AdminCommentRowDtoThread thread;
  final String targetId;
  final String? targetTitle;
  final String body;
  final String authorId;
  final String authorName;
  final AdminCommentRowDtoStatus status;
  final bool deleted;
  final String createdAt;

  Map<String, Object?> toJson() => _$AdminCommentRowDtoToJson(this);
}
