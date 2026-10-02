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
  });

  factory AdminPromotionStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminPromotionStatsDtoFromJson(json);

  final int activeCount;
  final int revenue30dCents;
  final int paid30dCount;
  final List<PromotionStatusCountDto> byStatus;

  Map<String, Object?> toJson() => _$AdminPromotionStatsDtoToJson(this);
}
