// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_sentry_issue_dto.dart';
import 'staff_sentry_summary_dto_state.dart';

part 'staff_sentry_summary_dto.g.dart';

@JsonSerializable()
class StaffSentrySummaryDto {
  const StaffSentrySummaryDto({
    required this.state,
    required this.unresolved,
    required this.unresolvedAtLeast,
    required this.newCount,
    required this.issues,
    required this.url,
    required this.error,
    required this.computedAt,
  });

  factory StaffSentrySummaryDto.fromJson(Map<String, Object?> json) =>
      _$StaffSentrySummaryDtoFromJson(json);

  /// off = switch today.sentry_enabled is off; unconfigured = no sentry keys saved.
  final StaffSentrySummaryDtoState state;
  final int unresolved;

  /// True when the page was full (100+).
  final bool unresolvedAtLeast;

  /// First seen in the last 24 h.
  final int newCount;
  final List<StaffSentryIssueDto> issues;
  final String? url;
  final String? error;
  final DateTime computedAt;

  Map<String, Object?> toJson() => _$StaffSentrySummaryDtoToJson(this);
}
