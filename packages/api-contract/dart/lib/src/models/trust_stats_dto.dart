// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'trust_level_count_dto.dart';
import 'trust_status_count_dto.dart';

part 'trust_stats_dto.g.dart';

@JsonSerializable()
class TrustStatsDto {
  const TrustStatsDto({
    required this.byLevel,
    required this.held,
    required this.withBadge,
    required this.verified,
    required this.complaints30d,
    required this.cleared,
    required this.inQueue,
    required this.enabled,
    required this.manualReview,
    required this.byStatus,
    required this.blockedBarNumbers,
  });

  factory TrustStatsDto.fromJson(Map<String, Object?> json) =>
      _$TrustStatsDtoFromJson(json);

  final List<TrustLevelCountDto> byLevel;

  /// Attorneys with any hold.
  final int held;
  final int withBadge;

  /// Verified attorneys in all.
  final int verified;

  /// Complaints in the last 30 days.
  final int complaints30d;

  /// Attorneys cleared (badge and payments open).
  final int cleared;

  /// Waiting for a person in the staff queue.
  final int inQueue;

  /// Master switch `trust.enabled`.
  final bool enabled;

  /// Staff review `trust.manual_review`; false = queue paused.
  final bool manualReview;

  /// Attorneys per badge status, same order as the enum.
  final List<TrustStatusCountDto> byStatus;

  /// Bar numbers on the block list right now (owner 07:00).
  final int blockedBarNumbers;

  Map<String, Object?> toJson() => _$TrustStatsDtoToJson(this);
}
