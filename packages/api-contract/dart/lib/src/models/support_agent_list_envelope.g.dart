// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_agent_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportAgentListEnvelope _$SupportAgentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportAgentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SupportAgentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportAgentListEnvelopeToJson(
  SupportAgentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
