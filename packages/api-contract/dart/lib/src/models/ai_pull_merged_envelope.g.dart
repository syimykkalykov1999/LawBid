// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_pull_merged_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiPullMergedEnvelope _$AiPullMergedEnvelopeFromJson(
  Map<String, dynamic> json,
) => AiPullMergedEnvelope(
  data: AiPullMergedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AiPullMergedEnvelopeToJson(
  AiPullMergedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
