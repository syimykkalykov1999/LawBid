// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_review_item_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeReviewItemEnvelope _$StripeReviewItemEnvelopeFromJson(
  Map<String, dynamic> json,
) => StripeReviewItemEnvelope(
  data: StripeReviewItemDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StripeReviewItemEnvelopeToJson(
  StripeReviewItemEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
