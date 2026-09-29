// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'read_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReadResultEnvelope _$ReadResultEnvelopeFromJson(Map<String, dynamic> json) =>
    ReadResultEnvelope(
      data: ReadResultDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReadResultEnvelopeToJson(ReadResultEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
