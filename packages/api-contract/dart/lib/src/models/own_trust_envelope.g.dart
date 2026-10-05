// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'own_trust_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnTrustEnvelope _$OwnTrustEnvelopeFromJson(Map<String, dynamic> json) =>
    OwnTrustEnvelope(
      data: OwnTrustDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$OwnTrustEnvelopeToJson(OwnTrustEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
