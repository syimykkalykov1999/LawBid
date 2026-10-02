// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CheckoutRequestDto _$CheckoutRequestDtoFromJson(Map<String, dynamic> json) =>
    CheckoutRequestDto(
      assistantPhones: (json['assistantPhones'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      promoCode: json['promoCode'] as String?,
      plan: json['plan'] == null
          ? SubscriptionPlan.monthly
          : SubscriptionPlan.fromJson(json['plan'] as String),
      assistantSeats: (json['assistantSeats'] as num?)?.toInt() ?? 0,
    );

Map<String, dynamic> _$CheckoutRequestDtoToJson(CheckoutRequestDto instance) =>
    <String, dynamic>{
      'plan': instance.plan.toJson(),
      'assistantSeats': instance.assistantSeats,
      'assistantPhones': ?instance.assistantPhones,
      'promoCode': ?instance.promoCode,
    };
