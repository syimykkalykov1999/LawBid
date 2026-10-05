// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_payout_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_payout_list_envelope.g.dart';

@JsonSerializable()
class PayrollPayoutListEnvelope {
  const PayrollPayoutListEnvelope({required this.data, this.meta});

  factory PayrollPayoutListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollPayoutListEnvelopeFromJson(json);

  final List<PayrollPayoutDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollPayoutListEnvelopeToJson(this);
}
