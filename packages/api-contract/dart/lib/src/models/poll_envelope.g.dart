// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'poll_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PollEnvelope _$PollEnvelopeFromJson(Map<String, dynamic> json) => PollEnvelope(
  data: PollDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PollEnvelopeToJson(PollEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
