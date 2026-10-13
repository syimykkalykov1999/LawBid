// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_case_task_dto_kind.dart';

part 'create_case_task_dto.g.dart';

@JsonSerializable()
class CreateCaseTaskDto {
  const CreateCaseTaskDto({
    required this.kind,
    required this.title,
    this.description,
  });

  factory CreateCaseTaskDto.fromJson(Map<String, Object?> json) =>
      _$CreateCaseTaskDtoFromJson(json);

  final CreateCaseTaskDtoKind kind;
  final String title;
  final String? description;

  Map<String, Object?> toJson() => _$CreateCaseTaskDtoToJson(this);
}
