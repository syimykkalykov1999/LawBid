// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stripe_dispute_evidence_dto_evidence_status.dart';

part 'stripe_dispute_evidence_dto.g.dart';

@JsonSerializable()
class StripeDisputeEvidenceDto {
  const StripeDisputeEvidenceDto({
    required this.fields,
    required this.evidenceStatus,
    required this.dueBy,
  });

  factory StripeDisputeEvidenceDto.fromJson(Map<String, Object?> json) =>
      _$StripeDisputeEvidenceDtoFromJson(json);

  final Map<String, String> fields;
  final StripeDisputeEvidenceDtoEvidenceStatus evidenceStatus;
  final DateTime? dueBy;

  Map<String, Object?> toJson() => _$StripeDisputeEvidenceDtoToJson(this);
}
