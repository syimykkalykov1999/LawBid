// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'edit_case_comment_dto.g.dart';

@JsonSerializable()
class EditCaseCommentDto {
  const EditCaseCommentDto({required this.body});

  factory EditCaseCommentDto.fromJson(Map<String, Object?> json) =>
      _$EditCaseCommentDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$EditCaseCommentDtoToJson(this);
}
