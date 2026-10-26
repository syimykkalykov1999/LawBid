// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachStatsEnvelope _$OutreachStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachStatsEnvelope(
  data: OutreachStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachStatsEnvelopeToJson(
  OutreachStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
