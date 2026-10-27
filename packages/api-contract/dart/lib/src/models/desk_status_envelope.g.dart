// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskStatusEnvelope _$DeskStatusEnvelopeFromJson(Map<String, dynamic> json) =>
    DeskStatusEnvelope(
      data: DeskStatusDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DeskStatusEnvelopeToJson(DeskStatusEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
