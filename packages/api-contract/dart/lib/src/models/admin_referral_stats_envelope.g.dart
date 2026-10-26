// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralStatsEnvelope _$AdminReferralStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReferralStatsEnvelope(
  data: AdminReferralStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReferralStatsEnvelopeToJson(
  AdminReferralStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
