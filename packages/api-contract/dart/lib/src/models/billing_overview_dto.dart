// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'billing_subscription_counts_dto.dart';

part 'billing_overview_dto.g.dart';

@JsonSerializable()
class BillingOverviewDto {
  const BillingOverviewDto({
    required this.mrrCents,
    required this.subscriptions,
    required this.contractGrantsActive,
    required this.revenue30dCents,
    required this.grossRevenue30dCents,
    required this.refunds30dCents,
    required this.refunds30dCount,
    required this.promoRedemptions30d,
    required this.generatedAt,
  });

  factory BillingOverviewDto.fromJson(Map<String, Object?> json) =>
      _$BillingOverviewDtoFromJson(json);

  /// Active + past_due: monthly $399 + $100 × seats, yearly $9,590 / 12. Trials and contract grants count $0.
  final int mrrCents;
  final BillingSubscriptionCountsDto subscriptions;
  final int contractGrantsActive;

  /// Paid in the last 30 days minus refunds issued then.
  final int revenue30dCents;
  final int grossRevenue30dCents;
  final int refunds30dCents;
  final int refunds30dCount;
  final int promoRedemptions30d;
  final DateTime generatedAt;

  Map<String, Object?> toJson() => _$BillingOverviewDtoToJson(this);
}
