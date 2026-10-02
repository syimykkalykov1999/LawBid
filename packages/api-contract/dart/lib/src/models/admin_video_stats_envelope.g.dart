// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_video_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideoStatsEnvelope _$AdminVideoStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminVideoStatsEnvelope(
  data: AdminVideoStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminVideoStatsEnvelopeToJson(
  AdminVideoStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
