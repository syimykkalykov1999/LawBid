// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'autoscale_tuning_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AutoscaleTuningReportEnvelope _$AutoscaleTuningReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => AutoscaleTuningReportEnvelope(
  data: AutoscaleTuningReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AutoscaleTuningReportEnvelopeToJson(
  AutoscaleTuningReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
