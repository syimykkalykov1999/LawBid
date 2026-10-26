// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_agent_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportAgentEnvelope _$SupportAgentEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportAgentEnvelope(
  data: SupportAgentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportAgentEnvelopeToJson(
  SupportAgentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
