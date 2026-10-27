// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_next_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewNextEnvelope _$ReviewNextEnvelopeFromJson(Map<String, dynamic> json) =>
    ReviewNextEnvelope(
      data: ReviewNextDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReviewNextEnvelopeToJson(ReviewNextEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
