// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamEnvelope _$TeamEnvelopeFromJson(Map<String, dynamic> json) => TeamEnvelope(
  data: TeamDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TeamEnvelopeToJson(TeamEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
