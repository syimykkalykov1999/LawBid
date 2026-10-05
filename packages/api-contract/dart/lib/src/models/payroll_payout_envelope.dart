// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_payout_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_payout_envelope.g.dart';

@JsonSerializable()
class PayrollPayoutEnvelope {
  const PayrollPayoutEnvelope({required this.data, this.meta});

  factory PayrollPayoutEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollPayoutEnvelopeFromJson(json);

  final PayrollPayoutDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollPayoutEnvelopeToJson(this);
}
