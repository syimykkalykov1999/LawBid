// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'desk_decision_day_dto.g.dart';

@JsonSerializable()
class DeskDecisionDayDto {
  const DeskDecisionDayDto({
    required this.day,
    required this.decided,
    required this.avgHandleSec,
    required this.reopened,
    required this.lateSla,
    required this.skips,
  });

  factory DeskDecisionDayDto.fromJson(Map<String, Object?> json) =>
      _$DeskDecisionDayDtoFromJson(json);

  final String day;
  final int decided;
  final int avgHandleSec;

  /// Came back after closing.
  final int reopened;

  /// Closed after the due time.
  final int lateSla;
  final int skips;

  Map<String, Object?> toJson() => _$DeskDecisionDayDtoToJson(this);
}
