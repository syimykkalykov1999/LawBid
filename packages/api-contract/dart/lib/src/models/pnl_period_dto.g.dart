// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pnl_period_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PnlPeriodDto _$PnlPeriodDtoFromJson(Map<String, dynamic> json) => PnlPeriodDto(
  revenueUsd: json['revenueUsd'] as num,
  vendorCostUsd: json['vendorCostUsd'] as num,
  fixedCostUsd: json['fixedCostUsd'] as num,
  costUsd: json['costUsd'] as num,
  profitUsd: json['profitUsd'] as num,
  marginPercent: json['marginPercent'] as num?,
);

Map<String, dynamic> _$PnlPeriodDtoToJson(PnlPeriodDto instance) =>
    <String, dynamic>{
      'revenueUsd': instance.revenueUsd,
      'vendorCostUsd': instance.vendorCostUsd,
      'fixedCostUsd': instance.fixedCostUsd,
      'costUsd': instance.costUsd,
      'profitUsd': instance.profitUsd,
      'marginPercent': ?instance.marginPercent,
    };
