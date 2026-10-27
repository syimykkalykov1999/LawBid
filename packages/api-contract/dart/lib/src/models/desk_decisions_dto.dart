// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_decision_day_dto.dart';

part 'desk_decisions_dto.g.dart';

@JsonSerializable()
class DeskDecisionsDto {
  const DeskDecisionsDto({required this.days, required this.decidedTotal});

  factory DeskDecisionsDto.fromJson(Map<String, Object?> json) =>
      _$DeskDecisionsDtoFromJson(json);

  /// My own days from the nightly counters, newest first.
  final List<DeskDecisionDayDto> days;
  final int decidedTotal;

  Map<String, Object?> toJson() => _$DeskDecisionsDtoToJson(this);
}
