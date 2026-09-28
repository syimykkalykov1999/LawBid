// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewSummaryEnvelope _$ReviewSummaryEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReviewSummaryEnvelope(
  data: ReviewSummaryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReviewSummaryEnvelopeToJson(
  ReviewSummaryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
