// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subscription_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SubscriptionMeDto _$SubscriptionMeDtoFromJson(Map<String, dynamic> json) =>
    SubscriptionMeDto(
      subscription: json['subscription'] == null
          ? null
          : SubscriptionDto.fromJson(
              json['subscription'] as Map<String, dynamic>,
            ),
      prices: PlanPricesDto.fromJson(json['prices'] as Map<String, dynamic>),
      isActive: json['isActive'] as bool,
      canStart: json['canStart'] as bool,
      trialEligible: json['trialEligible'] as bool,
      priceCents: (json['priceCents'] as num).toInt(),
    );

Map<String, dynamic> _$SubscriptionMeDtoToJson(SubscriptionMeDto instance) =>
    <String, dynamic>{
      'subscription': ?instance.subscription?.toJson(),
      'prices': instance.prices.toJson(),
      'isActive': instance.isActive,
      'canStart': instance.canStart,
      'trialEligible': instance.trialEligible,
      'priceCents': instance.priceCents,
    };
