// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stars_report_dto.dart';

part 'stars_report_envelope.g.dart';

@JsonSerializable()
class StarsReportEnvelope {
  const StarsReportEnvelope({required this.data, this.meta});

  factory StarsReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$StarsReportEnvelopeFromJson(json);

  final StarsReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarsReportEnvelopeToJson(this);
}
