// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_summary_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_summary_envelope.g.dart';

@JsonSerializable()
class PayrollSummaryEnvelope {
  const PayrollSummaryEnvelope({required this.data, this.meta});

  factory PayrollSummaryEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollSummaryEnvelopeFromJson(json);

  final PayrollSummaryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollSummaryEnvelopeToJson(this);
}
