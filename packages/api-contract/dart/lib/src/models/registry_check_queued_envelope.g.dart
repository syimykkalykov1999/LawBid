// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_check_queued_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryCheckQueuedEnvelope _$RegistryCheckQueuedEnvelopeFromJson(
  Map<String, dynamic> json,
) => RegistryCheckQueuedEnvelope(
  data: RegistryCheckQueuedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RegistryCheckQueuedEnvelopeToJson(
  RegistryCheckQueuedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
