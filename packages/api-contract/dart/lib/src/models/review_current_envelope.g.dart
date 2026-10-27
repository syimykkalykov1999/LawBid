// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'review_current_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReviewCurrentEnvelope _$ReviewCurrentEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReviewCurrentEnvelope(
  data: ReviewCurrentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReviewCurrentEnvelopeToJson(
  ReviewCurrentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
