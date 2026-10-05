// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_import_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachImportReportEnvelope _$OutreachImportReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachImportReportEnvelope(
  data: OutreachImportReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachImportReportEnvelopeToJson(
  OutreachImportReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
