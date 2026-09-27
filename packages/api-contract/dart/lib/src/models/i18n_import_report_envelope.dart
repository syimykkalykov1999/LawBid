// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'i18n_import_report_dto.dart';
import 'response_meta_dto.dart';

part 'i18n_import_report_envelope.g.dart';

@JsonSerializable()
class I18nImportReportEnvelope {
  const I18nImportReportEnvelope({required this.data, this.meta});

  factory I18nImportReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$I18nImportReportEnvelopeFromJson(json);

  final I18nImportReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$I18nImportReportEnvelopeToJson(this);
}
