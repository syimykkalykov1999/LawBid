// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_case_payments_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyCasePaymentsSummaryEnvelope _$MyCasePaymentsSummaryEnvelopeFromJson(
  Map<String, dynamic> json,
) => MyCasePaymentsSummaryEnvelope(
  data: MyCasePaymentsSummaryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MyCasePaymentsSummaryEnvelopeToJson(
  MyCasePaymentsSummaryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
