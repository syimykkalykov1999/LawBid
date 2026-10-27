// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_dispute_evidence_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeDisputeEvidenceEnvelope _$StripeDisputeEvidenceEnvelopeFromJson(
  Map<String, dynamic> json,
) => StripeDisputeEvidenceEnvelope(
  data: StripeDisputeEvidenceDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StripeDisputeEvidenceEnvelopeToJson(
  StripeDisputeEvidenceEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
