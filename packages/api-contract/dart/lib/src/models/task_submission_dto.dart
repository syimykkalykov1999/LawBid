// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_file_input_dto.dart';

part 'task_submission_dto.g.dart';

@JsonSerializable()
class TaskSubmissionDto {
  const TaskSubmissionDto({required this.files, this.note});

  factory TaskSubmissionDto.fromJson(Map<String, Object?> json) =>
      _$TaskSubmissionDtoFromJson(json);

  final String? note;
  final List<CaseFileInputDto> files;

  Map<String, Object?> toJson() => _$TaskSubmissionDtoToJson(this);
}
