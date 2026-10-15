// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_day_dto.g.dart';

@JsonSerializable()
class PromotionDayDto {
  const PromotionDayDto({
    required this.day,
    required this.impressions,
    required this.reach,
    required this.clicks,
  });

  factory PromotionDayDto.fromJson(Map<String, Object?> json) =>
      _$PromotionDayDtoFromJson(json);

  final String day;
  final int impressions;
  final int reach;
  final int clicks;

  Map<String, Object?> toJson() => _$PromotionDayDtoToJson(this);
}
