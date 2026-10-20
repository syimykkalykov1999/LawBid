// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pins_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PinsEnvelope _$PinsEnvelopeFromJson(Map<String, dynamic> json) => PinsEnvelope(
  data: PinsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PinsEnvelopeToJson(PinsEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
