// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'csam_report_dto.dart';
import 'response_meta_dto.dart';

part 'csam_report_envelope.g.dart';

@JsonSerializable()
class CsamReportEnvelope {
  const CsamReportEnvelope({required this.data, this.meta});

  factory CsamReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$CsamReportEnvelopeFromJson(json);

  final CsamReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CsamReportEnvelopeToJson(this);
}
