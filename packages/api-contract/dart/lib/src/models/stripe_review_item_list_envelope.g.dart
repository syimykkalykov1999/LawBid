// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_review_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeReviewItemListEnvelope _$StripeReviewItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StripeReviewItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StripeReviewItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StripeReviewItemListEnvelopeToJson(
  StripeReviewItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
