// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SessionListEnvelope _$SessionListEnvelopeFromJson(Map<String, dynamic> json) =>
    SessionListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => SessionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SessionListEnvelopeToJson(
  SessionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
