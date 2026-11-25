// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_heartbeat_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineHeartbeatEnvelope _$HotlineHeartbeatEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineHeartbeatEnvelope(
  data: HotlineHeartbeatDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineHeartbeatEnvelopeToJson(
  HotlineHeartbeatEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
