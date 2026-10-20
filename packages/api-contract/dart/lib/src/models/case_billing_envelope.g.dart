// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_billing_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseBillingEnvelope _$CaseBillingEnvelopeFromJson(Map<String, dynamic> json) =>
    CaseBillingEnvelope(
      data: CaseBillingDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CaseBillingEnvelopeToJson(
  CaseBillingEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
