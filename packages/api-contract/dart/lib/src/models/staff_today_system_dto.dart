// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_sentry_summary_dto.dart';
import 'staff_system_counts_dto.dart';
import 'staff_system_item_dto.dart';

part 'staff_today_system_dto.g.dart';

@JsonSerializable()
class StaffTodaySystemDto {
  const StaffTodaySystemDto({
    required this.computedAt,
    required this.freshSec,
    required this.items,
    required this.counts,
    required this.sentry,
  });

  factory StaffTodaySystemDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodaySystemDtoFromJson(json);

  final DateTime computedAt;

  /// The block is refreshed when older than this many seconds.
  final int freshSec;

  /// Ordered by urgency; empty = nothing to do.
  final List<StaffSystemItemDto> items;
  final StaffSystemCountsDto counts;
  final StaffSentrySummaryDto sentry;

  Map<String, Object?> toJson() => _$StaffTodaySystemDtoToJson(this);
}
