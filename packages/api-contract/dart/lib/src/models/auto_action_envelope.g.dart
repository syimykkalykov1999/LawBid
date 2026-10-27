// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auto_action_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoActionEnvelope _$AutoActionEnvelopeFromJson(Map<String, dynamic> json) =>
    AutoActionEnvelope(
      data: AutoActionDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AutoActionEnvelopeToJson(AutoActionEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
