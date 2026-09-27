// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_ended_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SessionEndedEnvelope _$SessionEndedEnvelopeFromJson(
  Map<String, dynamic> json,
) => SessionEndedEnvelope(
  data: SessionEndedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SessionEndedEnvelopeToJson(
  SessionEndedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
