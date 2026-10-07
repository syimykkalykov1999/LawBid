// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_plan_price_dto.g.dart';

@JsonSerializable()
class SetPlanPriceDto {
  const SetPlanPriceDto({
    required this.amountCents,
    this.note,
    this.compareAtCents,
    this.showDiscount,
  });

  factory SetPlanPriceDto.fromJson(Map<String, Object?> json) =>
      _$SetPlanPriceDtoFromJson(json);

  /// New price in cents ($1 … $100,000).
  final int amountCents;
  final String? note;

  /// Owner 2026-10-07: the strikethrough old price in cents; null clears it, absent keeps it.
  final int? compareAtCents;

  /// Show the discount (only while the old price is above the price); absent keeps it.
  final bool? showDiscount;

  Map<String, Object?> toJson() => _$SetPlanPriceDtoToJson(this);
}
