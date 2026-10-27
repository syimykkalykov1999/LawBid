// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'transparency_report_dto.dart';

part 'transparency_report_envelope.g.dart';

@JsonSerializable()
class TransparencyReportEnvelope {
  const TransparencyReportEnvelope({required this.data, this.meta});

  factory TransparencyReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$TransparencyReportEnvelopeFromJson(json);

  final TransparencyReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TransparencyReportEnvelopeToJson(this);
}
