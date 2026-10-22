// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'media_check_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MediaCheckEnvelope _$MediaCheckEnvelopeFromJson(Map<String, dynamic> json) =>
    MediaCheckEnvelope(
      data: MediaCheckDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$MediaCheckEnvelopeToJson(MediaCheckEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
