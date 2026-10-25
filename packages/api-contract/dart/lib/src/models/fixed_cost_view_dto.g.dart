// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fixed_cost_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FixedCostViewDto _$FixedCostViewDtoFromJson(Map<String, dynamic> json) =>
    FixedCostViewDto(
      id: json['id'] as String,
      label: json['label'] as String,
      usd: json['usd'] as num,
      period: FixedCostViewDtoPeriod.fromJson(json['period'] as String),
      monthlyUsd: json['monthlyUsd'] as num,
      paidMonth: json['paidMonth'] as String?,
    );

Map<String, dynamic> _$FixedCostViewDtoToJson(FixedCostViewDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'label': instance.label,
      'usd': instance.usd,
      'period': instance.period.toJson(),
      'paidMonth': ?instance.paidMonth,
      'monthlyUsd': instance.monthlyUsd,
    };
