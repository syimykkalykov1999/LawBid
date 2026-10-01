// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'activity_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActivityStatusEnvelope _$ActivityStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => ActivityStatusEnvelope(
  data: ActivityStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ActivityStatusEnvelopeToJson(
  ActivityStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
