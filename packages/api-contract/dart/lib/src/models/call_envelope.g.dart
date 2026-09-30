// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallEnvelope _$CallEnvelopeFromJson(Map<String, dynamic> json) => CallEnvelope(
  data: CallDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CallEnvelopeToJson(CallEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
