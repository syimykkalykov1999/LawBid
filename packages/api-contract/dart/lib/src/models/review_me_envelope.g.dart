// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewMeEnvelope _$ReviewMeEnvelopeFromJson(Map<String, dynamic> json) =>
    ReviewMeEnvelope(
      data: ReviewMeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReviewMeEnvelopeToJson(ReviewMeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
