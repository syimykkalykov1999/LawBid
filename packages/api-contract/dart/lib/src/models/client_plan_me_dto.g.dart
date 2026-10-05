// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_plan_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientPlanMeDto _$ClientPlanMeDtoFromJson(Map<String, dynamic> json) =>
    ClientPlanMeDto(
      subscription: json['subscription'] == null
          ? null
          : ClientSubscriptionDto.fromJson(
              json['subscription'] as Map<String, dynamic>,
            ),
      isActive: json['isActive'] as bool,
      plan: json['plan'] == null
          ? null
          : PublicPlanDto.fromJson(json['plan'] as Map<String, dynamic>),
      entitlements: PlanEntitlementsDto.fromJson(
        json['entitlements'] as Map<String, dynamic>,
      ),
      plans: (json['plans'] as List<dynamic>)
          .map((e) => PublicPlanDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      trialEligible: json['trialEligible'] as bool,
    );

Map<String, dynamic> _$ClientPlanMeDtoToJson(ClientPlanMeDto instance) =>
    <String, dynamic>{
      'subscription': ?instance.subscription?.toJson(),
      'isActive': instance.isActive,
      'plan': ?instance.plan?.toJson(),
      'entitlements': instance.entitlements.toJson(),
      'plans': instance.plans.map((e) => e.toJson()).toList(),
      'trialEligible': instance.trialEligible,
    };
