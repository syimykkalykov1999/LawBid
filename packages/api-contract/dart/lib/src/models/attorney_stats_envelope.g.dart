// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'attorney_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AttorneyStatsEnvelope _$AttorneyStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AttorneyStatsEnvelope(
  data: AttorneyStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AttorneyStatsEnvelopeToJson(
  AttorneyStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
