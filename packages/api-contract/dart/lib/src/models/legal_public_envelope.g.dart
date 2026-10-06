// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_public_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalPublicEnvelope _$LegalPublicEnvelopeFromJson(Map<String, dynamic> json) =>
    LegalPublicEnvelope(
      data: LegalPublicDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LegalPublicEnvelopeToJson(
  LegalPublicEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
