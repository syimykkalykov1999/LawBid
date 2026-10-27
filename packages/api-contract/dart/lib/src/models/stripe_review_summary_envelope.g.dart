// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_review_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeReviewSummaryEnvelope _$StripeReviewSummaryEnvelopeFromJson(
  Map<String, dynamic> json,
) => StripeReviewSummaryEnvelope(
  data: StripeReviewSummaryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StripeReviewSummaryEnvelopeToJson(
  StripeReviewSummaryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
