// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'selfie_handoff_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SelfieHandoffEnvelope _$SelfieHandoffEnvelopeFromJson(
  Map<String, dynamic> json,
) => SelfieHandoffEnvelope(
  data: SelfieHandoffDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SelfieHandoffEnvelopeToJson(
  SelfieHandoffEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
