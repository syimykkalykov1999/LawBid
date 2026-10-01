// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_comment_thread.dart';

part 'admin_remove_comment_dto.g.dart';

@JsonSerializable()
class AdminRemoveCommentDto {
  const AdminRemoveCommentDto({required this.reason, required this.thread});

  factory AdminRemoveCommentDto.fromJson(Map<String, Object?> json) =>
      _$AdminRemoveCommentDtoFromJson(json);

  final String reason;
  final AdminCommentThread thread;

  Map<String, Object?> toJson() => _$AdminRemoveCommentDtoToJson(this);
}
