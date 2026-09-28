// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewEnvelope _$ReviewEnvelopeFromJson(Map<String, dynamic> json) =>
    ReviewEnvelope(
      data: ReviewDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReviewEnvelopeToJson(ReviewEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
