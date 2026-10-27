// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_verdict_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewVerdictResultEnvelope _$ReviewVerdictResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReviewVerdictResultEnvelope(
  data: ReviewVerdictResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReviewVerdictResultEnvelopeToJson(
  ReviewVerdictResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
