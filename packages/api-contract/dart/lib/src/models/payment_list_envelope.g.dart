// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentListEnvelope _$PaymentListEnvelopeFromJson(Map<String, dynamic> json) =>
    PaymentListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => PaymentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PaymentListEnvelopeToJson(
  PaymentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
