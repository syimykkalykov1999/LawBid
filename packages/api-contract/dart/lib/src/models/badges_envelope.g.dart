// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'badges_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BadgesEnvelope _$BadgesEnvelopeFromJson(Map<String, dynamic> json) =>
    BadgesEnvelope(
      data: BadgesDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BadgesEnvelopeToJson(BadgesEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
