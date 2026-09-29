// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'start_subscription_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StartSubscriptionResultDto _$StartSubscriptionResultDtoFromJson(
  Map<String, dynamic> json,
) => StartSubscriptionResultDto(
  clientSecret: json['clientSecret'] as String,
  setupIntentId: json['setupIntentId'] as String,
  customerId: json['customerId'] as String,
  trialEligible: json['trialEligible'] as bool,
  priceCents: (json['priceCents'] as num).toInt(),
  trialDays: (json['trialDays'] as num).toInt(),
);

Map<String, dynamic> _$StartSubscriptionResultDtoToJson(
  StartSubscriptionResultDto instance,
) => <String, dynamic>{
  'clientSecret': instance.clientSecret,
  'setupIntentId': instance.setupIntentId,
  'customerId': instance.customerId,
  'trialEligible': instance.trialEligible,
  'priceCents': instance.priceCents,
  'trialDays': instance.trialDays,
};
