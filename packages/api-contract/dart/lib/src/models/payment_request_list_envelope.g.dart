// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_request_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentRequestListEnvelope _$PaymentRequestListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PaymentRequestListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PaymentRequestDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PaymentRequestListEnvelopeToJson(
  PaymentRequestListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
