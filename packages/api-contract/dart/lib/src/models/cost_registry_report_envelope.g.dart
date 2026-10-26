// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_registry_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostRegistryReportEnvelope _$CostRegistryReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => CostRegistryReportEnvelope(
  data: CostRegistryReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CostRegistryReportEnvelopeToJson(
  CostRegistryReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
