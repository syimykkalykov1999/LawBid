// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_handoff_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationHandoffEnvelope _$VerificationHandoffEnvelopeFromJson(
  Map<String, dynamic> json,
) => VerificationHandoffEnvelope(
  data: VerificationHandoffDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VerificationHandoffEnvelopeToJson(
  VerificationHandoffEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
