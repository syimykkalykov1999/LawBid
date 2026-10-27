// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reporting_status_dto.dart';
import 'response_meta_dto.dart';

part 'reporting_status_envelope.g.dart';

@JsonSerializable()
class ReportingStatusEnvelope {
  const ReportingStatusEnvelope({required this.data, this.meta});

  factory ReportingStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReportingStatusEnvelopeFromJson(json);

  final ReportingStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReportingStatusEnvelopeToJson(this);
}
