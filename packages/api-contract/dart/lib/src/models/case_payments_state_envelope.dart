// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payments_state_dto.dart';
import 'response_meta_dto.dart';

part 'case_payments_state_envelope.g.dart';

@JsonSerializable()
class CasePaymentsStateEnvelope {
  const CasePaymentsStateEnvelope({required this.data, this.meta});

  factory CasePaymentsStateEnvelope.fromJson(Map<String, Object?> json) =>
      _$CasePaymentsStateEnvelopeFromJson(json);

  final CasePaymentsStateDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CasePaymentsStateEnvelopeToJson(this);
}
