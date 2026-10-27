// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_heartbeat_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskHeartbeatResultEnvelope _$DeskHeartbeatResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeskHeartbeatResultEnvelope(
  data: DeskHeartbeatResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeskHeartbeatResultEnvelopeToJson(
  DeskHeartbeatResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
