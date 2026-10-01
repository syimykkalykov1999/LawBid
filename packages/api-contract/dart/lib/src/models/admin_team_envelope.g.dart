// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_team_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTeamEnvelope _$AdminTeamEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminTeamEnvelope(
      data: AdminTeamDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminTeamEnvelopeToJson(AdminTeamEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
