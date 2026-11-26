// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'e2ee_report_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

E2eeReportResultEnvelope _$E2eeReportResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => E2eeReportResultEnvelope(
  data: E2eeReportResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$E2eeReportResultEnvelopeToJson(
  E2eeReportResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
