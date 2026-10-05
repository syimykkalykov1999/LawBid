// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payment_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentEnvelope _$CasePaymentEnvelopeFromJson(Map<String, dynamic> json) =>
    CasePaymentEnvelope(
      data: CasePaymentDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CasePaymentEnvelopeToJson(
  CasePaymentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
