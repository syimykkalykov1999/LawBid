// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'price_discount_dto.dart';

part 'plan_prices_dto.g.dart';

@JsonSerializable()
class PlanPricesDto {
  const PlanPricesDto({
    required this.monthlyCents,
    required this.seatCents,
    required this.yearlyCents,
    required this.maxSeats,
    required this.trialDays,
    required this.monthlyDiscount,
    required this.seatDiscount,
    required this.yearlyDiscount,
  });

  factory PlanPricesDto.fromJson(Map<String, Object?> json) =>
      _$PlanPricesDtoFromJson(json);

  final int monthlyCents;
  final int seatCents;
  final int yearlyCents;
  final int maxSeats;

  /// Free trial days for a new subscription (admin setting; 0 = no trial).
  final int trialDays;
  final PriceDiscountDto? monthlyDiscount;
  final PriceDiscountDto? seatDiscount;
  final PriceDiscountDto? yearlyDiscount;

  Map<String, Object?> toJson() => _$PlanPricesDtoToJson(this);
}
