// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_hold_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalHoldEnvelope _$LegalHoldEnvelopeFromJson(Map<String, dynamic> json) =>
    LegalHoldEnvelope(
      data: LegalHoldDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LegalHoldEnvelopeToJson(LegalHoldEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
