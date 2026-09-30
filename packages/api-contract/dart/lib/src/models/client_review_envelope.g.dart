// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_review_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientReviewEnvelope _$ClientReviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClientReviewEnvelope(
  data: ClientReviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClientReviewEnvelopeToJson(
  ClientReviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
