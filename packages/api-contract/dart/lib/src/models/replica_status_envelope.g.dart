// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'replica_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReplicaStatusEnvelope _$ReplicaStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReplicaStatusEnvelope(
  data: ReplicaStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReplicaStatusEnvelopeToJson(
  ReplicaStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
