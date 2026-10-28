// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calls_path_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallsPathEnvelope _$CallsPathEnvelopeFromJson(Map<String, dynamic> json) =>
    CallsPathEnvelope(
      data: CallsPathDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CallsPathEnvelopeToJson(CallsPathEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
