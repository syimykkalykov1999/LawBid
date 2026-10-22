// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'seat_change_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SeatChangeResultDto _$SeatChangeResultDtoFromJson(Map<String, dynamic> json) =>
    SeatChangeResultDto(
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
      status: SeatChangeResult.fromJson(json['status'] as String),
      clientSecret: json['clientSecret'] as String?,
      amountCents: (json['amountCents'] as num).toInt(),
      currency: json['currency'] as String,
      effectiveAt: json['effectiveAt'] == null
          ? null
          : DateTime.parse(json['effectiveAt'] as String),
      changeId: json['changeId'] as String?,
      overview: SubscriptionMeDto.fromJson(
        json['overview'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$SeatChangeResultDtoToJson(
  SeatChangeResultDto instance,
) => <String, dynamic>{
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
  'status': instance.status.toJson(),
  'clientSecret': ?instance.clientSecret,
  'amountCents': instance.amountCents,
  'currency': instance.currency,
  'effectiveAt': ?instance.effectiveAt?.toIso8601String(),
  'changeId': ?instance.changeId,
  'overview': instance.overview.toJson(),
};
