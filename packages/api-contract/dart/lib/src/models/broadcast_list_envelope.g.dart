// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'broadcast_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BroadcastListEnvelope _$BroadcastListEnvelopeFromJson(
  Map<String, dynamic> json,
) => BroadcastListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => BroadcastDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BroadcastListEnvelopeToJson(
  BroadcastListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
