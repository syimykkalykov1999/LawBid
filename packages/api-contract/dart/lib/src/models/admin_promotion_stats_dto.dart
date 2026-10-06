// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_status_count_dto.dart';

part 'admin_promotion_stats_dto.g.dart';

@JsonSerializable()
class AdminPromotionStatsDto {
  const AdminPromotionStatsDto({
    required this.activeCount,
    required this.revenue30dCents,
    required this.paid30dCount,
    required this.byStatus,
    required this.activePosts,
    required this.activeCases,
    required this.pendingReview,
    required this.impressions30d,
    required this.reach30d,
    required this.clicks30d,
  });

  factory AdminPromotionStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminPromotionStatsDtoFromJson(json);

  final int activeCount;
  final int revenue30dCents;
  final int paid30dCount;
  final List<PromotionStatusCountDto> byStatus;
  final int activePosts;
  final int activeCases;

  /// Waiting for a staff check.
  final int pendingReview;

  /// Impressions, last 30 days.
  final int impressions30d;
  final int reach30d;
  final int clicks30d;

  Map<String, Object?> toJson() => _$AdminPromotionStatsDtoToJson(this);
}
