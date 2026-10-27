// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_ai_summary_dto.dart';

part 'staff_ai_summary_envelope.g.dart';

@JsonSerializable()
class StaffAiSummaryEnvelope {
  const StaffAiSummaryEnvelope({required this.data, this.meta});

  factory StaffAiSummaryEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffAiSummaryEnvelopeFromJson(json);

  final StaffAiSummaryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffAiSummaryEnvelopeToJson(this);
}
