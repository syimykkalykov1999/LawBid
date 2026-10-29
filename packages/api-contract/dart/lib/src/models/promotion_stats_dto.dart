// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_promotion_dto.dart';
import 'promotion_day_dto.dart';

part 'promotion_stats_dto.g.dart';

@JsonSerializable()
class PromotionStatsDto {
  const PromotionStatsDto({
    required this.promotion,
    required this.days,
    required this.spentCents,
  });
  
  factory PromotionStatsDto.fromJson(Map<String, Object?> json) => _$PromotionStatsDtoFromJson(json);
  
  final MyPromotionDto promotion;
  final List<PromotionDayDto> days;

  /// Spent so far, cents.
  final int spentCents;

  Map<String, Object?> toJson() => _$PromotionStatsDtoToJson(this);
}
