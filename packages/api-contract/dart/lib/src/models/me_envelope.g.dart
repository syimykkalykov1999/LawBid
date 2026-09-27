// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MeEnvelope _$MeEnvelopeFromJson(Map<String, dynamic> json) => MeEnvelope(
  data: MeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MeEnvelopeToJson(MeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
