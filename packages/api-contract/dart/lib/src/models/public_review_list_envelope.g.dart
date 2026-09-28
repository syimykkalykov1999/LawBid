// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_review_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicReviewListEnvelope _$PublicReviewListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PublicReviewListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PublicReviewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PublicReviewListEnvelopeToJson(
  PublicReviewListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
