// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'boost_offer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BoostOfferDto _$BoostOfferDtoFromJson(Map<String, dynamic> json) =>
    BoostOfferDto(
      billing: BoostBilling.fromJson(json['billing'] as String),
      priceCents: (json['priceCents'] as num).toInt(),
    );

Map<String, dynamic> _$BoostOfferDtoToJson(BoostOfferDto instance) =>
    <String, dynamic>{
      'billing': instance.billing.toJson(),
      'priceCents': instance.priceCents,
    };
