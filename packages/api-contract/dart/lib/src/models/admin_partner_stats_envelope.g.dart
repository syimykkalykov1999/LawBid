// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerStatsEnvelope _$AdminPartnerStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPartnerStatsEnvelope(
  data: AdminPartnerStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPartnerStatsEnvelopeToJson(
  AdminPartnerStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
