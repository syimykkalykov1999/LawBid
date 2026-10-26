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
      trialDays: (json['trialDays'] as num).toInt(),
      monthlyDiscount: json['monthlyDiscount'] == null
          ? null
          : PriceDiscountDto.fromJson(
              json['monthlyDiscount'] as Map<String, dynamic>,
            ),
      seatDiscount: json['seatDiscount'] == null
          ? null
          : PriceDiscountDto.fromJson(
              json['seatDiscount'] as Map<String, dynamic>,
            ),
      yearlyDiscount: json['yearlyDiscount'] == null
          ? null
          : PriceDiscountDto.fromJson(
              json['yearlyDiscount'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$PlanPricesDtoToJson(PlanPricesDto instance) =>
    <String, dynamic>{
      'monthlyCents': instance.monthlyCents,
      'seatCents': instance.seatCents,
      'yearlyCents': instance.yearlyCents,
      'maxSeats': instance.maxSeats,
      'trialDays': instance.trialDays,
      'monthlyDiscount': ?instance.monthlyDiscount?.toJson(),
      'seatDiscount': ?instance.seatDiscount?.toJson(),
      'yearlyDiscount': ?instance.yearlyDiscount?.toJson(),
    };
