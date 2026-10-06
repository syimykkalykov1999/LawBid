// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'treasury_plan_dto.g.dart';

@JsonSerializable()
class TreasuryPlanDto {
  const TreasuryPlanDto({
    required this.servicesCents,
    required this.expenseAllowanceCents,
    required this.stripeObligationsCents,
    required this.cushionCents,
    required this.reserveTargetCents,
    required this.monthlyCostCents,
    required this.expensePayoutCents,
    required this.profitPayoutCents,
    required this.heldProfitCents,
    required this.shortfallCents,
    required this.coverMonths,
  });

  factory TreasuryPlanDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryPlanDtoFromJson(json);

  final int servicesCents;
  final int expenseAllowanceCents;
  final int stripeObligationsCents;
  final int cushionCents;
  final int reserveTargetCents;
  final int monthlyCostCents;
  final int expensePayoutCents;
  final int profitPayoutCents;
  final int heldProfitCents;
  final int shortfallCents;
  final num? coverMonths;

  Map<String, Object?> toJson() => _$TreasuryPlanDtoToJson(this);
}
