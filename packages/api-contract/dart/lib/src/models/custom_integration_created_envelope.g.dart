// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'custom_integration_created_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CustomIntegrationCreatedEnvelope _$CustomIntegrationCreatedEnvelopeFromJson(
  Map<String, dynamic> json,
) => CustomIntegrationCreatedEnvelope(
  data: CustomIntegrationCreatedDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CustomIntegrationCreatedEnvelopeToJson(
  CustomIntegrationCreatedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
