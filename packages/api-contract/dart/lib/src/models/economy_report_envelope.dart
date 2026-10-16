// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'economy_report_dto.dart';
import 'response_meta_dto.dart';

part 'economy_report_envelope.g.dart';

@JsonSerializable()
class EconomyReportEnvelope {
  const EconomyReportEnvelope({required this.data, this.meta});

  factory EconomyReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$EconomyReportEnvelopeFromJson(json);

  final EconomyReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$EconomyReportEnvelopeToJson(this);
}
