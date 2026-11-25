// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineStatsEnvelope _$HotlineStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineStatsEnvelope(
  data: HotlineStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineStatsEnvelopeToJson(
  HotlineStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
