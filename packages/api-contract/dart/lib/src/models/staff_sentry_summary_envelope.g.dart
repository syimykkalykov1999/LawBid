// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_sentry_summary_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSentrySummaryEnvelope _$StaffSentrySummaryEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffSentrySummaryEnvelope(
  data: StaffSentrySummaryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffSentrySummaryEnvelopeToJson(
  StaffSentrySummaryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
