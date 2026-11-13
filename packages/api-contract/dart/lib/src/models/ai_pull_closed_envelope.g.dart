// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_pull_closed_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPullClosedEnvelope _$AiPullClosedEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiPullClosedEnvelope(
  data: AiPullClosedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiPullClosedEnvelopeToJson(
  AiPullClosedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
