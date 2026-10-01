// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plan_prices_dto.g.dart';

@JsonSerializable()
class PlanPricesDto {
  const PlanPricesDto({
    required this.monthlyCents,
    required this.seatCents,
    required this.yearlyCents,
    required this.maxSeats,
  });

  factory PlanPricesDto.fromJson(Map<String, Object?> json) =>
      _$PlanPricesDtoFromJson(json);

  final int monthlyCents;
  final int seatCents;
  final int yearlyCents;
  final int maxSeats;

  Map<String, Object?> toJson() => _$PlanPricesDtoToJson(this);
}
