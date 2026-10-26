// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_session_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSessionEnvelope _$SfuSessionEnvelopeFromJson(Map<String, dynamic> json) =>
    SfuSessionEnvelope(
      data: SfuSessionDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SfuSessionEnvelopeToJson(SfuSessionEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
