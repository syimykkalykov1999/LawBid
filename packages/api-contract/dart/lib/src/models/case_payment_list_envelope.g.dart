// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentListEnvelope _$CasePaymentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CasePaymentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CasePaymentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CasePaymentListEnvelopeToJson(
  CasePaymentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
