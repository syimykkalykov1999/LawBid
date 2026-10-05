// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_case_payment_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCasePaymentResultEnvelope _$CreateCasePaymentResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => CreateCasePaymentResultEnvelope(
  data: CreateCasePaymentResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CreateCasePaymentResultEnvelopeToJson(
  CreateCasePaymentResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
