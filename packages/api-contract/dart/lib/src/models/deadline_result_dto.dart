// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'deadline_holiday_dto.dart';
import 'deadline_result_dto_warnings.dart';
import 'deadline_rule_dto.dart';

part 'deadline_result_dto.g.dart';

@JsonSerializable()
class DeadlineResultDto {
  const DeadlineResultDto({
    required this.rule,
    required this.eventDate,
    required this.dueDate,
    required this.rawDate,
    required this.rolled,
    required this.holidays,
    required this.warnings,
  });

  factory DeadlineResultDto.fromJson(Map<String, Object?> json) =>
      _$DeadlineResultDtoFromJson(json);

  final DeadlineRuleDto rule;
  final String eventDate;

  /// The last day.
  final String dueDate;

  /// The date before moving past a weekend or holiday.
  final String rawDate;
  final bool rolled;
  final List<DeadlineHolidayDto> holidays;

  /// holidays_missing: court holidays of that year are not loaded; unverified: the rule is not checked by staff yet; rolled: moved past a weekend or holiday.
  final List<DeadlineResultDtoWarnings> warnings;

  Map<String, Object?> toJson() => _$DeadlineResultDtoToJson(this);
}
