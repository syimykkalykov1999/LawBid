// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout_session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CheckoutSessionDto _$CheckoutSessionDtoFromJson(Map<String, dynamic> json) =>
    CheckoutSessionDto(
      url: json['url'] as String,
      sessionId: json['sessionId'] as String,
      trialEligible: json['trialEligible'] as bool,
      priceCents: (json['priceCents'] as num).toInt(),
      trialDays: (json['trialDays'] as num).toInt(),
      promo: json['promo'] == null
          ? null
          : CheckoutPromoDto.fromJson(json['promo'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CheckoutSessionDtoToJson(CheckoutSessionDto instance) =>
    <String, dynamic>{
      'url': instance.url,
      'sessionId': instance.sessionId,
      'trialEligible': instance.trialEligible,
      'priceCents': instance.priceCents,
      'trialDays': instance.trialDays,
      'promo': ?instance.promo?.toJson(),
    };
