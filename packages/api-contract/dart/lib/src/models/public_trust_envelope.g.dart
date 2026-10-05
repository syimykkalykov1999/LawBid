// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_trust_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicTrustEnvelope _$PublicTrustEnvelopeFromJson(Map<String, dynamic> json) =>
    PublicTrustEnvelope(
      data: PublicTrustDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PublicTrustEnvelopeToJson(
  PublicTrustEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
