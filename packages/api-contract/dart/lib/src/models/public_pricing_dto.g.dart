// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_pricing_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicPricingDto _$PublicPricingDtoFromJson(Map<String, dynamic> json) =>
    PublicPricingDto(
      currency: json['currency'] as String,
      monthlyCents: (json['monthlyCents'] as num).toInt(),
      seatCents: (json['seatCents'] as num).toInt(),
      yearlyCents: (json['yearlyCents'] as num).toInt(),
      maxSeats: (json['maxSeats'] as num).toInt(),
      trialDays: (json['trialDays'] as num).toInt(),
      clientBadgeCents: (json['clientBadgeCents'] as num).toInt(),
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
      clientBadgeDiscount: json['clientBadgeDiscount'] == null
          ? null
          : PriceDiscountDto.fromJson(
              json['clientBadgeDiscount'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$PublicPricingDtoToJson(PublicPricingDto instance) =>
    <String, dynamic>{
      'currency': instance.currency,
      'monthlyCents': instance.monthlyCents,
      'seatCents': instance.seatCents,
      'yearlyCents': instance.yearlyCents,
      'maxSeats': instance.maxSeats,
      'trialDays': instance.trialDays,
      'clientBadgeCents': instance.clientBadgeCents,
      'monthlyDiscount': ?instance.monthlyDiscount?.toJson(),
      'seatDiscount': ?instance.seatDiscount?.toJson(),
      'yearlyDiscount': ?instance.yearlyDiscount?.toJson(),
      'clientBadgeDiscount': ?instance.clientBadgeDiscount?.toJson(),
    };
