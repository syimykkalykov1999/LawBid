// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_accrual_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_accrual_envelope.g.dart';

@JsonSerializable()
class PayrollAccrualEnvelope {
  const PayrollAccrualEnvelope({required this.data, this.meta});

  factory PayrollAccrualEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollAccrualEnvelopeFromJson(json);

  final PayrollAccrualDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollAccrualEnvelopeToJson(this);
}
