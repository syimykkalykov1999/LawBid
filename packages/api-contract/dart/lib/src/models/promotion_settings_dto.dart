// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_settings_dto.g.dart';

@JsonSerializable()
class PromotionSettingsDto {
  const PromotionSettingsDto({
    required this.enabled,
    required this.priceCentsPerDay,
    required this.maxDays,
    this.maxActivePerCase = 1,
  });

  factory PromotionSettingsDto.fromJson(Map<String, Object?> json) =>
      _$PromotionSettingsDtoFromJson(json);

  final bool enabled;
  final int priceCentsPerDay;
  final int maxDays;
  final int maxActivePerCase;

  Map<String, Object?> toJson() => _$PromotionSettingsDtoToJson(this);
}
