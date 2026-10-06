// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_agent_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaAgentEnvelope _$DmcaAgentEnvelopeFromJson(Map<String, dynamic> json) =>
    DmcaAgentEnvelope(
      data: DmcaAgentDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DmcaAgentEnvelopeToJson(DmcaAgentEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
