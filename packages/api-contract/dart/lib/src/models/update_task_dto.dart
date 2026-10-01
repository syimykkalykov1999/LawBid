// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_task_kind.dart';

part 'update_task_dto.g.dart';

@JsonSerializable()
class UpdateTaskDto {
  const UpdateTaskDto({
    this.kind,
    this.title,
    this.notes,
    this.dueAt,
    this.clearDueAt,
    this.caseId,
    this.clearCaseId,
    this.location,
    this.contactName,
    this.contactPhone,
    this.contactEmail,
    this.fileIds,
  });

  factory UpdateTaskDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTaskDtoFromJson(json);

  final AttorneyTaskKind? kind;
  final String? title;
  final String? notes;
  final DateTime? dueAt;

  /// true removes the time.
  final bool? clearDueAt;

  /// Link another case.
  final String? caseId;

  /// Unlink the case.
  final bool? clearCaseId;
  final String? location;
  final String? contactName;
  final String? contactPhone;
  final String? contactEmail;
  final List<String>? fileIds;

  Map<String, Object?> toJson() => _$UpdateTaskDtoToJson(this);
}
