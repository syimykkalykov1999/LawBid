// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_comment_dto.g.dart';

@JsonSerializable()
class CreateCommentDto {
  const CreateCommentDto({required this.body, this.parentCommentId});

  factory CreateCommentDto.fromJson(Map<String, Object?> json) =>
      _$CreateCommentDtoFromJson(json);

  final String body;

  /// Reply target; a reply to a reply attaches to its top-level parent.
  final String? parentCommentId;

  Map<String, Object?> toJson() => _$CreateCommentDtoToJson(this);
}
