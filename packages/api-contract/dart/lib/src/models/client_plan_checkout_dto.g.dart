// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_plan_checkout_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientPlanCheckoutDto _$ClientPlanCheckoutDtoFromJson(
  Map<String, dynamic> json,
) => ClientPlanCheckoutDto(
  url: json['url'] as String,
  sessionId: json['sessionId'] as String,
  priceCents: (json['priceCents'] as num).toInt(),
  trialDays: (json['trialDays'] as num).toInt(),
);

Map<String, dynamic> _$ClientPlanCheckoutDtoToJson(
  ClientPlanCheckoutDto instance,
) => <String, dynamic>{
  'url': instance.url,
  'sessionId': instance.sessionId,
  'priceCents': instance.priceCents,
  'trialDays': instance.trialDays,
};
