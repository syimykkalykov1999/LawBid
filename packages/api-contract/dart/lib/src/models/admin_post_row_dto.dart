// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_post_row_dto_kind.dart';
import 'admin_post_row_dto_status.dart';

part 'admin_post_row_dto.g.dart';

@JsonSerializable()
class AdminPostRowDto {
  const AdminPostRowDto({
    required this.id,
    required this.kind,
    required this.body,
    required this.authorId,
    required this.authorName,
    required this.status,
    required this.likes,
    required this.comments,
    required this.deleted,
    required this.createdAt,
    this.title,
    this.practice,
  });

  factory AdminPostRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminPostRowDtoFromJson(json);

  final String id;
  final AdminPostRowDtoKind kind;
  final String? title;
  final String body;
  final String authorId;
  final String authorName;
  final String? practice;
  final AdminPostRowDtoStatus status;
  final int likes;
  final int comments;
  final bool deleted;
  final String createdAt;

  Map<String, Object?> toJson() => _$AdminPostRowDtoToJson(this);
}
