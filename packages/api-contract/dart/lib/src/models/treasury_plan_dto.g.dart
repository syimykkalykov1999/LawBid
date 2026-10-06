// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_plan_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryPlanDto _$TreasuryPlanDtoFromJson(Map<String, dynamic> json) =>
    TreasuryPlanDto(
      servicesCents: (json['servicesCents'] as num).toInt(),
      expenseAllowanceCents: (json['expenseAllowanceCents'] as num).toInt(),
      stripeObligationsCents: (json['stripeObligationsCents'] as num).toInt(),
      cushionCents: (json['cushionCents'] as num).toInt(),
      reserveTargetCents: (json['reserveTargetCents'] as num).toInt(),
      monthlyCostCents: (json['monthlyCostCents'] as num).toInt(),
      expensePayoutCents: (json['expensePayoutCents'] as num).toInt(),
      profitPayoutCents: (json['profitPayoutCents'] as num).toInt(),
      heldProfitCents: (json['heldProfitCents'] as num).toInt(),
      shortfallCents: (json['shortfallCents'] as num).toInt(),
      coverMonths: json['coverMonths'] as num?,
    );

Map<String, dynamic> _$TreasuryPlanDtoToJson(TreasuryPlanDto instance) =>
    <String, dynamic>{
      'servicesCents': instance.servicesCents,
      'expenseAllowanceCents': instance.expenseAllowanceCents,
      'stripeObligationsCents': instance.stripeObligationsCents,
      'cushionCents': instance.cushionCents,
      'reserveTargetCents': instance.reserveTargetCents,
      'monthlyCostCents': instance.monthlyCostCents,
      'expensePayoutCents': instance.expensePayoutCents,
      'profitPayoutCents': instance.profitPayoutCents,
      'heldProfitCents': instance.heldProfitCents,
      'shortfallCents': instance.shortfallCents,
      'coverMonths': ?instance.coverMonths,
    };
