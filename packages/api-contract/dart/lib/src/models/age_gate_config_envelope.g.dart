// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'age_gate_config_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AgeGateConfigEnvelope _$AgeGateConfigEnvelopeFromJson(
  Map<String, dynamic> json,
) => AgeGateConfigEnvelope(
  data: AgeGateConfigDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AgeGateConfigEnvelopeToJson(
  AgeGateConfigEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
