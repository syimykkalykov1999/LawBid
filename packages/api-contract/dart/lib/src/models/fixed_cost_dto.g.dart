// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fixed_cost_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FixedCostDto _$FixedCostDtoFromJson(Map<String, dynamic> json) => FixedCostDto(
  id: json['id'] as String,
  label: json['label'] as String,
  usd: json['usd'] as num,
  period: FixedCostDtoPeriod.fromJson(json['period'] as String),
  paidMonth: json['paidMonth'] as String?,
);

Map<String, dynamic> _$FixedCostDtoToJson(FixedCostDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'usd': instance.usd,
      'period': instance.period.toJson(),
      'paidMonth': ?instance.paidMonth,
    };
