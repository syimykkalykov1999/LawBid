// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autoscale_tuning_report_dto.dart';
import 'response_meta_dto.dart';

part 'autoscale_tuning_report_envelope.g.dart';

@JsonSerializable()
class AutoscaleTuningReportEnvelope {
  const AutoscaleTuningReportEnvelope({required this.data, this.meta});

  factory AutoscaleTuningReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$AutoscaleTuningReportEnvelopeFromJson(json);

  final AutoscaleTuningReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AutoscaleTuningReportEnvelopeToJson(this);
}
