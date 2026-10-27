// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auto_metrics_dto.dart';
import 'response_meta_dto.dart';

part 'auto_metrics_envelope.g.dart';

@JsonSerializable()
class AutoMetricsEnvelope {
  const AutoMetricsEnvelope({required this.data, this.meta});

  factory AutoMetricsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AutoMetricsEnvelopeFromJson(json);

  final AutoMetricsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AutoMetricsEnvelopeToJson(this);
}
