// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_action_row_dto.dart';
import 'staff_open_recommendation_dto.dart';
import 'staff_person_history_dto_state.dart';
import 'staff_signal_count_dto.dart';

part 'staff_person_history_dto.g.dart';

@JsonSerializable()
class StaffPersonHistoryDto {
  const StaffPersonHistoryDto({
    required this.adminId,
    required this.state,
    required this.stateUntil,
    required this.signals,
    required this.actions,
    required this.recommendations,
  });

  factory StaffPersonHistoryDto.fromJson(Map<String, Object?> json) =>
      _$StaffPersonHistoryDtoFromJson(json);

  final String adminId;

  /// Where the person stands in the queues.
  final StaffPersonHistoryDtoState state;
  final DateTime? stateUntil;

  /// Last 30 days.
  final List<StaffSignalCountDto> signals;

  /// Last 20 actions.
  final List<StaffActionRowDto> actions;
  final List<StaffOpenRecommendationDto> recommendations;

  Map<String, Object?> toJson() => _$StaffPersonHistoryDtoToJson(this);
}
