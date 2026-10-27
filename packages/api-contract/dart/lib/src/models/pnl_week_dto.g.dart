// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pnl_week_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PnlWeekDto _$PnlWeekDtoFromJson(Map<String, dynamic> json) => PnlWeekDto(
  weekStart: json['weekStart'] as String,
  revenueUsd: json['revenueUsd'] as num,
  costUsd: json['costUsd'] as num,
  profitUsd: json['profitUsd'] as num,
  marginPercent: json['marginPercent'] as num?,
);

Map<String, dynamic> _$PnlWeekDtoToJson(PnlWeekDto instance) =>
    <String, dynamic>{
      'weekStart': instance.weekStart,
      'revenueUsd': instance.revenueUsd,
      'costUsd': instance.costUsd,
      'profitUsd': instance.profitUsd,
      'marginPercent': ?instance.marginPercent,
    };
