// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_plan_checkout_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientPlanCheckoutEnvelope _$ClientPlanCheckoutEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientPlanCheckoutEnvelope(
  data: ClientPlanCheckoutDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientPlanCheckoutEnvelopeToJson(
  ClientPlanCheckoutEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
