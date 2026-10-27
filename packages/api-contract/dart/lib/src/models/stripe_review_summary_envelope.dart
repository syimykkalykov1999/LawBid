// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stripe_review_summary_dto.dart';

part 'stripe_review_summary_envelope.g.dart';

@JsonSerializable()
class StripeReviewSummaryEnvelope {
  const StripeReviewSummaryEnvelope({required this.data, this.meta});

  factory StripeReviewSummaryEnvelope.fromJson(Map<String, Object?> json) =>
      _$StripeReviewSummaryEnvelopeFromJson(json);

  final StripeReviewSummaryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StripeReviewSummaryEnvelopeToJson(this);
}
