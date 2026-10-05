// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_accrual_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_accrual_list_envelope.g.dart';

@JsonSerializable()
class PayrollAccrualListEnvelope {
  const PayrollAccrualListEnvelope({required this.data, this.meta});

  factory PayrollAccrualListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollAccrualListEnvelopeFromJson(json);

  final List<PayrollAccrualDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollAccrualListEnvelopeToJson(this);
}
