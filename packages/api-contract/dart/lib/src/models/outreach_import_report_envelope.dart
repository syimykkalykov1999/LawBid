// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_import_report_dto.dart';
import 'response_meta_dto.dart';

part 'outreach_import_report_envelope.g.dart';

@JsonSerializable()
class OutreachImportReportEnvelope {
  const OutreachImportReportEnvelope({required this.data, this.meta});

  factory OutreachImportReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$OutreachImportReportEnvelopeFromJson(json);

  final OutreachImportReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OutreachImportReportEnvelopeToJson(this);
}
