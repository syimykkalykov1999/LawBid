// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_stripe_link_dto.dart';
import 'response_meta_dto.dart';

part 'payroll_stripe_link_envelope.g.dart';

@JsonSerializable()
class PayrollStripeLinkEnvelope {
  const PayrollStripeLinkEnvelope({required this.data, this.meta});

  factory PayrollStripeLinkEnvelope.fromJson(Map<String, Object?> json) =>
      _$PayrollStripeLinkEnvelopeFromJson(json);

  final PayrollStripeLinkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PayrollStripeLinkEnvelopeToJson(this);
}
