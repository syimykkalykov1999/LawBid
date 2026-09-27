// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_import_report_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nImportReportEnvelope _$I18nImportReportEnvelopeFromJson(
  Map<String, dynamic> json,
) => I18nImportReportEnvelope(
  data: I18nImportReportDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$I18nImportReportEnvelopeToJson(
  I18nImportReportEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
