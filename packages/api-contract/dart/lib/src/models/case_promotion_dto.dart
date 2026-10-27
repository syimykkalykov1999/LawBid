// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';
import 'case_promotion_status.dart';
import 'promotion_audience_dto.dart';
import 'promotion_target.dart';

part 'case_promotion_dto.g.dart';

@JsonSerializable()
class CasePromotionDto {
  const CasePromotionDto({
    required this.id,
    required this.targetType,
    required this.status,
    required this.days,
    required this.priceCentsPerDay,
    required this.totalCents,
    required this.paidStars,
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.billing,
    required this.deliveredUnits,
    required this.actions,
    required this.refundedCents,
    required this.createdAt,
    this.caseId,
    this.postId,
    this.startsAt,
    this.endsAt,
    this.targetImpressions,
    this.unitPriceCents,
    this.targetUnits,
    this.audience,
    this.cancelReason,
    this.goal,
    this.ctaType,
    this.ctaValue,
  });

  factory CasePromotionDto.fromJson(Map<String, Object?> json) =>
      _$CasePromotionDtoFromJson(json);

  final String id;
  final PromotionTarget targetType;
  final String? caseId;
  final String? postId;
  final CasePromotionStatus status;
  final int days;
  final int priceCentsPerDay;

  /// Charged amount.
  final int totalCents;

  /// Stars paid (0 = by card).
  final int paidStars;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int impressions;

  /// Distinct people reached.
  final int reach;
  final int clicks;

  /// Impressions the budget buys (null = no cap).
  final int? targetImpressions;
  final BoostBilling billing;
  final int? unitPriceCents;

  /// Units the budget buys (views, people, taps, actions).
  final int? targetUnits;

  /// Units delivered so far.
  final int deliveredUnits;

  /// Real actions counted.
  final int actions;

  /// Money given back.
  final int refundedCents;
  final PromotionAudienceDto? audience;
  final String? cancelReason;
  final String? goal;
  final String? ctaType;
  final String? ctaValue;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$CasePromotionDtoToJson(this);
}
