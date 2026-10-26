// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'support_staff_stats_dto.g.dart';

@JsonSerializable()
class SupportStaffStatsDto {
  const SupportStaffStatsDto({
    required this.adminId,
    required this.name,
    required this.replies,
    required this.firstResponses,
    required this.resolved,
    required this.slaBreaches,
    required this.openNow,
    required this.onShift,
    this.medianFirstResponseMinutes,
  });

  factory SupportStaffStatsDto.fromJson(Map<String, Object?> json) =>
      _$SupportStaffStatsDtoFromJson(json);

  final String adminId;
  final String name;

  /// Public answers written.
  final num replies;

  /// Tickets answered first by this agent.
  final num firstResponses;

  /// Median minutes to their first answers.
  final num? medianFirstResponseMinutes;

  /// Tickets this agent resolved or closed.
  final num resolved;

  /// Their tickets whose answer was late.
  final num slaBreaches;

  /// Open tickets assigned now.
  final num openNow;
  final bool onShift;

  Map<String, Object?> toJson() => _$SupportStaffStatsDtoToJson(this);
}
