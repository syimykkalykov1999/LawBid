// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_payment_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCasePaymentStatsEnvelope _$AdminCasePaymentStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminCasePaymentStatsEnvelope(
  data: AdminCasePaymentStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminCasePaymentStatsEnvelopeToJson(
  AdminCasePaymentStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
