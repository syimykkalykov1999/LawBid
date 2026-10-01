// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';

part 'create_task_dto.g.dart';

@JsonSerializable()
class CreateTaskDto {
  const CreateTaskDto({
    required this.kind,
    required this.title,
    this.notes,
    this.dueAt,
    this.location,
    this.caseId,
    this.contactName,
    this.contactPhone,
    this.fileIds,
  });

  factory CreateTaskDto.fromJson(Map<String, Object?> json) =>
      _$CreateTaskDtoFromJson(json);

  final AttorneyTaskKind kind;
  final String title;
  final String? notes;
  final DateTime? dueAt;
  final String? location;
  final String? caseId;
  final String? contactName;
  final String? contactPhone;
  final List<String>? fileIds;

  Map<String, Object?> toJson() => _$CreateTaskDtoToJson(this);
}
