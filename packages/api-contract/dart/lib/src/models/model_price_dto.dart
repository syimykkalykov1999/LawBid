// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'model_price_dto.g.dart';

@JsonSerializable()
class ModelPriceDto {
  const ModelPriceDto({required this.enabled, required this.priceCents});

  factory ModelPriceDto.fromJson(Map<String, Object?> json) =>
      _$ModelPriceDtoFromJson(json);

  final bool enabled;

  /// Per 1000 for impressions / reach, per one otherwise.
  final int priceCents;

  Map<String, Object?> toJson() => _$ModelPriceDtoToJson(this);
}
