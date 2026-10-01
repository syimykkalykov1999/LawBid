// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_version_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationVersionEnvelope _$IntegrationVersionEnvelopeFromJson(
  Map<String, dynamic> json,
) => IntegrationVersionEnvelope(
  data: IntegrationVersionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IntegrationVersionEnvelopeToJson(
  IntegrationVersionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
