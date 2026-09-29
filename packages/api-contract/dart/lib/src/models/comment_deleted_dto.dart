// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'comment_deleted_dto.g.dart';

@JsonSerializable()
class CommentDeletedDto {
  const CommentDeletedDto({this.deleted = true});

  factory CommentDeletedDto.fromJson(Map<String, Object?> json) =>
      _$CommentDeletedDtoFromJson(json);

  final bool deleted;

  Map<String, Object?> toJson() => _$CommentDeletedDtoToJson(this);
}
