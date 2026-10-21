// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_billing_dto.dart';
import 'response_meta_dto.dart';

part 'case_billing_envelope.g.dart';

@JsonSerializable()
class CaseBillingEnvelope {
  const CaseBillingEnvelope({required this.data, this.meta});

  factory CaseBillingEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseBillingEnvelopeFromJson(json);

  final CaseBillingDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseBillingEnvelopeToJson(this);
}
