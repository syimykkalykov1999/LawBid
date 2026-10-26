// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_payments_state_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePaymentsStateEnvelope _$CasePaymentsStateEnvelopeFromJson(
  Map<String, dynamic> json,
) => CasePaymentsStateEnvelope(
  data: CasePaymentsStateDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CasePaymentsStateEnvelopeToJson(
  CasePaymentsStateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
