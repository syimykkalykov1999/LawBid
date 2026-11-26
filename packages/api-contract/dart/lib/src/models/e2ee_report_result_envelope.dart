// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'e2ee_report_result_dto.dart';
import 'response_meta_dto.dart';

part 'e2ee_report_result_envelope.g.dart';

@JsonSerializable()
class E2eeReportResultEnvelope {
  const E2eeReportResultEnvelope({required this.data, this.meta});

  factory E2eeReportResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$E2eeReportResultEnvelopeFromJson(json);

  final E2eeReportResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$E2eeReportResultEnvelopeToJson(this);
}
