// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_handoff_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationHandoffStatusEnvelope _$VerificationHandoffStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => VerificationHandoffStatusEnvelope(
  data: VerificationHandoffStatusDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VerificationHandoffStatusEnvelopeToJson(
  VerificationHandoffStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
