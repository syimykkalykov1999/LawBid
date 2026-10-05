// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_request_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentRequestEnvelope _$PaymentRequestEnvelopeFromJson(
  Map<String, dynamic> json,
) => PaymentRequestEnvelope(
  data: PaymentRequestDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PaymentRequestEnvelopeToJson(
  PaymentRequestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
