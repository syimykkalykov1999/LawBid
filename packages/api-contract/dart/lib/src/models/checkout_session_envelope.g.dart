// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout_session_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CheckoutSessionEnvelope _$CheckoutSessionEnvelopeFromJson(
  Map<String, dynamic> json,
) => CheckoutSessionEnvelope(
  data: CheckoutSessionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CheckoutSessionEnvelopeToJson(
  CheckoutSessionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
