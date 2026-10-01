// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan_prices_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlanPricesDto _$PlanPricesDtoFromJson(Map<String, dynamic> json) =>
    PlanPricesDto(
      monthlyCents: (json['monthlyCents'] as num).toInt(),
      seatCents: (json['seatCents'] as num).toInt(),
      yearlyCents: (json['yearlyCents'] as num).toInt(),
      maxSeats: (json['maxSeats'] as num).toInt(),
    );

Map<String, dynamic> _$PlanPricesDtoToJson(PlanPricesDto instance) =>
    <String, dynamic>{
      'monthlyCents': instance.monthlyCents,
      'seatCents': instance.seatCents,
      'yearlyCents': instance.yearlyCents,
      'maxSeats': instance.maxSeats,
    };
