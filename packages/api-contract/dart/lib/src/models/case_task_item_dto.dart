// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'workspace_file_dto.dart';

part 'case_task_item_dto.g.dart';

@JsonSerializable()
class CaseTaskItemDto {
  const CaseTaskItemDto({
    required this.id,
    required this.title,
    required this.done,
    required this.files,
    this.doneAt,
  });

  factory CaseTaskItemDto.fromJson(Map<String, Object?> json) =>
      _$CaseTaskItemDtoFromJson(json);

  final String id;
  final String title;
  final bool done;
  final String? doneAt;
  final List<WorkspaceFileDto> files;

  Map<String, Object?> toJson() => _$CaseTaskItemDtoToJson(this);
}
