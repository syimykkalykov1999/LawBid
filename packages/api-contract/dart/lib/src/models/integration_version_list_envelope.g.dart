// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integration_version_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationVersionListEnvelope _$IntegrationVersionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => IntegrationVersionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => IntegrationVersionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IntegrationVersionListEnvelopeToJson(
  IntegrationVersionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
