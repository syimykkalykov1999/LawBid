// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_dispute_submit_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeDisputeSubmitResultEnvelope _$StripeDisputeSubmitResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StripeDisputeSubmitResultEnvelope(
  data: StripeDisputeSubmitResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StripeDisputeSubmitResultEnvelopeToJson(
  StripeDisputeSubmitResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
