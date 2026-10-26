// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cost_registry_report_dto.dart';
import 'response_meta_dto.dart';

part 'cost_registry_report_envelope.g.dart';

@JsonSerializable()
class CostRegistryReportEnvelope {
  const CostRegistryReportEnvelope({required this.data, this.meta});

  factory CostRegistryReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$CostRegistryReportEnvelopeFromJson(json);

  final CostRegistryReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CostRegistryReportEnvelopeToJson(this);
}
