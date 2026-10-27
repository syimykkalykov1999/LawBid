// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stripe_review_summary_dto_dispute_rate_level.dart';

part 'stripe_review_summary_dto.g.dart';

@JsonSerializable()
class StripeReviewSummaryDto {
  const StripeReviewSummaryDto({
    required this.open,
    required this.overdue,
    required this.byKind,
    required this.disputes30d,
    required this.payments30d,
    required this.disputeRatePercent,
    required this.disputeRateLevel,
  });

  factory StripeReviewSummaryDto.fromJson(Map<String, Object?> json) =>
      _$StripeReviewSummaryDtoFromJson(json);

  final int open;
  final int overdue;
  final Map<String, int> byKind;
  final int disputes30d;
  final int payments30d;

  /// Percent, two decimals.
  final num disputeRatePercent;
  final StripeReviewSummaryDtoDisputeRateLevel disputeRateLevel;

  Map<String, Object?> toJson() => _$StripeReviewSummaryDtoToJson(this);
}
