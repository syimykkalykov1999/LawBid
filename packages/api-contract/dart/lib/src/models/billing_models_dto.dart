// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'model_price_dto.dart';

part 'billing_models_dto.g.dart';

@JsonSerializable()
class BillingModelsDto {
  const BillingModelsDto({
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.actions,
  });

  factory BillingModelsDto.fromJson(Map<String, Object?> json) =>
      _$BillingModelsDtoFromJson(json);

  /// Views (per 1000).
  final ModelPriceDto impressions;

  /// People (per 1000).
  final ModelPriceDto reach;

  /// Taps (each).
  final ModelPriceDto clicks;

  /// Real actions (each).
  final ModelPriceDto actions;

  Map<String, Object?> toJson() => _$BillingModelsDtoToJson(this);
}
