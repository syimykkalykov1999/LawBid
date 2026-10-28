// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_sentry_summary_dto.dart';

part 'staff_sentry_summary_envelope.g.dart';

@JsonSerializable()
class StaffSentrySummaryEnvelope {
  const StaffSentrySummaryEnvelope({required this.data, this.meta});

  factory StaffSentrySummaryEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffSentrySummaryEnvelopeFromJson(json);

  final StaffSentrySummaryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffSentrySummaryEnvelopeToJson(this);
}
