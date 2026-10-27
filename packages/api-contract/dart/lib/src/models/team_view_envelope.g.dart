// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_view_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamViewEnvelope _$TeamViewEnvelopeFromJson(Map<String, dynamic> json) =>
    TeamViewEnvelope(
      data: TeamViewDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$TeamViewEnvelopeToJson(TeamViewEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
