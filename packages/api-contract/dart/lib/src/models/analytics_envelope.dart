// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'analytics_dto.dart';
import 'response_meta_dto.dart';

part 'analytics_envelope.g.dart';

@JsonSerializable()
class AnalyticsEnvelope {
  const AnalyticsEnvelope({required this.data, this.meta});

  factory AnalyticsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AnalyticsEnvelopeFromJson(json);

  final AnalyticsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AnalyticsEnvelopeToJson(this);
}
