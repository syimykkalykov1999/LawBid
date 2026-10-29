// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'task_done_dto.g.dart';

@JsonSerializable()
class TaskDoneDto {
  const TaskDoneDto({
    required this.done,
  });
  
  factory TaskDoneDto.fromJson(Map<String, Object?> json) => _$TaskDoneDtoFromJson(json);
  
  final bool done;

  Map<String, Object?> toJson() => _$TaskDoneDtoToJson(this);
}
