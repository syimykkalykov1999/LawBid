// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_decision_of_day_dto.dart';
import 'staff_today_anomalies_dto.dart';
import 'staff_today_appeals_dto.dart';
import 'staff_today_flags_dto.dart';
import 'staff_today_piecework_dto.dart';
import 'staff_today_shortlist_dto.dart';
import 'staff_today_suggestions_dto.dart';

part 'staff_today_dto.g.dart';

@JsonSerializable()
class StaffTodayDto {
  const StaffTodayDto({
    required this.computedAt,
    this.decision,
    this.appeals,
    this.flags,
    this.shortlist,
    this.suggestions,
    this.anomalies,
    this.piecework,
  });

  factory StaffTodayDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayDtoFromJson(json);

  final DateTime computedAt;

  /// The one most important thing to decide today, or null.
  final StaffDecisionOfDayDto? decision;

  /// null = its switch is off.
  final StaffTodayAppealsDto? appeals;
  final StaffTodayFlagsDto? flags;
  final StaffTodayShortlistDto? shortlist;
  final StaffTodaySuggestionsDto? suggestions;
  final StaffTodayAnomaliesDto? anomalies;
  final StaffTodayPieceworkDto? piecework;

  Map<String, Object?> toJson() => _$StaffTodayDtoToJson(this);
}
