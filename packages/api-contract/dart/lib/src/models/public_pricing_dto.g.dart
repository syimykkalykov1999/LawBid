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
    };
