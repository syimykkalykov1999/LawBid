// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pnl_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PnlDayDto _$PnlDayDtoFromJson(Map<String, dynamic> json) => PnlDayDto(
  day: json['day'] as String,
  revenueUsd: json['revenueUsd'] as num,
  costUsd: json['costUsd'] as num,
  profitUsd: json['profitUsd'] as num,
);

Map<String, dynamic> _$PnlDayDtoToJson(PnlDayDto instance) => <String, dynamic>{
  'day': instance.day,
  'revenueUsd': instance.revenueUsd,
  'costUsd': instance.costUsd,
  'profitUsd': instance.profitUsd,
};
