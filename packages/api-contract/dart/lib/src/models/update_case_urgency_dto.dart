// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_deadline_kind.dart';
import 'case_urgency.dart';

part 'update_case_urgency_dto.g.dart';

@JsonSerializable()
class UpdateCaseUrgencyDto {
  const UpdateCaseUrgencyDto({
    this.urgency,
    this.deadlineAt,
    this.deadlineKind,
  });

  factory UpdateCaseUrgencyDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCaseUrgencyDtoFromJson(json);

  /// Owner 2026-10-04/05: how soon the client needs an attorney — a.
  /// level, or `by_date` with deadlineAt (a date alone means `by_date`).
  /// A level clears the date; null clears both.
  final CaseUrgency? urgency;

  /// Owner 2026-10-05: the date it is needed by (today … 2 years).
  final DateTime? deadlineAt;

  /// Owner 2026-10-05: what the date is; only with a date.
  final CaseDeadlineKind? deadlineKind;

  Map<String, Object?> toJson() => _$UpdateCaseUrgencyDtoToJson(this);
}
