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
      contractGrant: json['contractGrant'] == null
          ? null
          : ContractGrantInfoDto.fromJson(
              json['contractGrant'] as Map<String, dynamic>,
            ),
      prices: PlanPricesDto.fromJson(json['prices'] as Map<String, dynamic>),
      isActive: json['isActive'] as bool,
      canStart: json['canStart'] as bool,
      trialEligible: json['trialEligible'] as bool,
      priceCents: (json['priceCents'] as num).toInt(),
      plan: json['plan'] == null
          ? null
          : PublicPlanDto.fromJson(json['plan'] as Map<String, dynamic>),
      plans: (json['plans'] as List<dynamic>)
          .map((e) => PublicPlanDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      entitlements: PlanEntitlementsDto.fromJson(
        json['entitlements'] as Map<String, dynamic>,
      ),
      seats: json['seats'] == null
          ? null
          : SeatSummaryDto.fromJson(json['seats'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SubscriptionMeDtoToJson(SubscriptionMeDto instance) =>
    <String, dynamic>{
      'subscription': ?instance.subscription?.toJson(),
      'contractGrant': ?instance.contractGrant?.toJson(),
      'prices': instance.prices.toJson(),
      'isActive': instance.isActive,
      'canStart': instance.canStart,
      'trialEligible': instance.trialEligible,
      'priceCents': instance.priceCents,
      'plan': ?instance.plan?.toJson(),
      'plans': instance.plans.map((e) => e.toJson()).toList(),
      'entitlements': instance.entitlements.toJson(),
      'seats': ?instance.seats?.toJson(),
    };
