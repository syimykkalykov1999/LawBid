// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'template_copy_target.dart';

part 'copy_template_dto.g.dart';

@JsonSerializable()
class CopyTemplateDto {
  const CopyTemplateDto({required this.target});

  factory CopyTemplateDto.fromJson(Map<String, Object?> json) =>
      _$CopyTemplateDtoFromJson(json);

  /// chat_attachment: send it with a chat message; case_attachment: add it to a case.
  final TemplateCopyTarget target;

  Map<String, Object?> toJson() => _$CopyTemplateDtoToJson(this);
}
