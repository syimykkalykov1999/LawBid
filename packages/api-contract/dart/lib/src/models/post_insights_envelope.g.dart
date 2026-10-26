// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_insights_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostInsightsEnvelope _$PostInsightsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PostInsightsEnvelope(
  data: PostInsightsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PostInsightsEnvelopeToJson(
  PostInsightsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
