// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_test_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryTestResultEnvelope _$RegistryTestResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => RegistryTestResultEnvelope(
  data: RegistryTestResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RegistryTestResultEnvelopeToJson(
  RegistryTestResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
