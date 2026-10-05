// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_quote_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentQuoteEnvelope _$PaymentQuoteEnvelopeFromJson(
  Map<String, dynamic> json,
) => PaymentQuoteEnvelope(
  data: PaymentQuoteDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PaymentQuoteEnvelopeToJson(
  PaymentQuoteEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
