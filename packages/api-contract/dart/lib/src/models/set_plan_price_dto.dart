// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_plan_price_dto.g.dart';

@JsonSerializable()
class SetPlanPriceDto {
  const SetPlanPriceDto({required this.amountCents, this.note});

  factory SetPlanPriceDto.fromJson(Map<String, Object?> json) =>
      _$SetPlanPriceDtoFromJson(json);

  /// New price in cents ($1 … $100,000).
  final int amountCents;
  final String? note;

  Map<String, Object?> toJson() => _$SetPlanPriceDtoToJson(this);
}
