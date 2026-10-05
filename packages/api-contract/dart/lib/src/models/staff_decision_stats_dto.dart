// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_admin_dto.dart';

part 'staff_decision_stats_dto.g.dart';

@JsonSerializable()
class StaffDecisionStatsDto {
  const StaffDecisionStatsDto({
    required this.admin,
    required this.cleared,
    required this.uncleared,
    required this.rejected,
    required this.documentsRequested,
    required this.released,
    required this.fastDecisions,
    required this.medianSecondsBetween,
    required this.laterComplaints,
    required this.laterSuspended,
    required this.firstDecisionAt,
    required this.lastDecisionAt,
  });

  factory StaffDecisionStatsDto.fromJson(Map<String, Object?> json) =>
      _$StaffDecisionStatsDtoFromJson(json);

  final StaffAdminDto admin;

  /// «Подтвердить» pressed.
  final int cleared;
  final int uncleared;

  /// «Отклонить» pressed.
  final int rejected;
  final int documentsRequested;

  /// Holds lifted.
  final int released;

  /// Decisions under a minute after the previous one.
  final int fastDecisions;

  /// Median seconds between consecutive decisions in a sitting.
  final int? medianSecondsBetween;

  /// Attorneys they cleared who drew a complaint afterwards.
  final int laterComplaints;

  /// Attorneys they cleared who were suspended afterwards.
  final int laterSuspended;
  final DateTime firstDecisionAt;
  final DateTime lastDecisionAt;

  Map<String, Object?> toJson() => _$StaffDecisionStatsDtoToJson(this);
}
