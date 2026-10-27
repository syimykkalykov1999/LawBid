// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stripe_dispute_evidence_dto.dart';

part 'stripe_dispute_evidence_envelope.g.dart';

@JsonSerializable()
class StripeDisputeEvidenceEnvelope {
  const StripeDisputeEvidenceEnvelope({required this.data, this.meta});

  factory StripeDisputeEvidenceEnvelope.fromJson(Map<String, Object?> json) =>
      _$StripeDisputeEvidenceEnvelopeFromJson(json);

  final StripeDisputeEvidenceDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StripeDisputeEvidenceEnvelopeToJson(this);
}
