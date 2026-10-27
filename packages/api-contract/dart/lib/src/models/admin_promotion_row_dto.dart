// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';
import 'case_promotion_status.dart';
import 'promotion_audience_dto.dart';
import 'promotion_target.dart';

part 'admin_promotion_row_dto.g.dart';

@JsonSerializable()
class AdminPromotionRowDto {
  const AdminPromotionRowDto({
    required this.reach,
    required this.targetType,
    required this.ownerId,
    required this.caseTitle,
    required this.status,
    required this.days,
    required this.priceCentsPerDay,
    required this.totalCents,
    required this.paidStars,
    required this.createdAt,
    required this.refundedCents,
    required this.impressions,
    required this.id,
    required this.clicks,
    required this.actions,
    required this.billing,
    required this.caseStatus,
    required this.deliveredUnits,
    this.unitPriceCents,
    this.targetImpressions,
    this.endsAt,
    this.audience,
    this.cancelReason,
    this.goal,
    this.grantedBy,
    this.ctaValue,
    this.startsAt,
    this.postId,
    this.reviewedBy,
    this.cpmCents,
    this.ctaType,
    this.caseId,
    this.ownerName,
    this.ownerEmail,
    this.paymentId,
    this.promoCodeId,
    this.targetUnits,
  });

  factory AdminPromotionRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminPromotionRowDtoFromJson(json);

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

  /// Case title, or the post title / text.
  final String caseTitle;
  final String? reviewedBy;
  final int? cpmCents;
  final String caseStatus;
  final String ownerId;
  final String? ownerName;
  final String? ownerEmail;
  final String? paymentId;
  final String? promoCodeId;
  final String? grantedBy;

  Map<String, Object?> toJson() => _$AdminPromotionRowDtoToJson(this);
}
