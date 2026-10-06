// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_reveal_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationRevealEnvelope _$IntegrationRevealEnvelopeFromJson(
  Map<String, dynamic> json,
) => IntegrationRevealEnvelope(
  data: IntegrationRevealDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IntegrationRevealEnvelopeToJson(
  IntegrationRevealEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
