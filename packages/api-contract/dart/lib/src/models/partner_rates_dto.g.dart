// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_rates_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerRatesDto _$PartnerRatesDtoFromJson(Map<String, dynamic> json) =>
    PartnerRatesDto(
      attorneyRateCents: (json['attorneyRateCents'] as num).toInt(),
      clientRateCents: (json['clientRateCents'] as num).toInt(),
      monthlyBaseCents: (json['monthlyBaseCents'] as num).toInt(),
      clientRule: PartnerClientRule.fromJson(json['clientRule'] as String),
      holdDays: (json['holdDays'] as num).toInt(),
    );

Map<String, dynamic> _$PartnerRatesDtoToJson(PartnerRatesDto instance) =>
    <String, dynamic>{
      'attorneyRateCents': instance.attorneyRateCents,
      'clientRateCents': instance.clientRateCents,
      'monthlyBaseCents': instance.monthlyBaseCents,
      'clientRule': instance.clientRule.toJson(),
      'holdDays': instance.holdDays,
    };
