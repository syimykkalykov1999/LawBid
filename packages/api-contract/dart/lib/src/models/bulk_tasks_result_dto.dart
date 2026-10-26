// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bulk_tasks_result_dto.g.dart';

@JsonSerializable()
class BulkTasksResultDto {
  const BulkTasksResultDto({required this.affected, required this.skipped});

  factory BulkTasksResultDto.fromJson(Map<String, Object?> json) =>
      _$BulkTasksResultDtoFromJson(json);

  /// Tasks changed.
  final num affected;

  /// Tasks left as they were (not yours to change, or already so).
  final num skipped;

  Map<String, Object?> toJson() => _$BulkTasksResultDtoToJson(this);
}
