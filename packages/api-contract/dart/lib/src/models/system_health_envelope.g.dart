// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'system_health_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SystemHealthEnvelope _$SystemHealthEnvelopeFromJson(
  Map<String, dynamic> json,
) => SystemHealthEnvelope(
  data: SystemHealthDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SystemHealthEnvelopeToJson(
  SystemHealthEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
