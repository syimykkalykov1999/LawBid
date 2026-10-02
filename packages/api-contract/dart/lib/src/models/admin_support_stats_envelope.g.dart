// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportStatsEnvelope _$AdminSupportStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSupportStatsEnvelope(
  data: AdminSupportStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSupportStatsEnvelopeToJson(
  AdminSupportStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
