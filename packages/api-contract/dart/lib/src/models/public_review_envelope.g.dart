// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_review_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicReviewEnvelope _$PublicReviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => PublicReviewEnvelope(
  data: PublicReviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PublicReviewEnvelopeToJson(
  PublicReviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
