// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_promotion_status.dart';
import 'promotion_audience_dto.dart';
import 'promotion_target.dart';

part 'admin_promotion_row_dto.g.dart';

@JsonSerializable()
class AdminPromotionRowDto {
  const AdminPromotionRowDto({
    required this.id,
    required this.targetType,
    required this.status,
    required this.days,
    required this.priceCentsPerDay,
    required this.totalCents,
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.createdAt,
    required this.caseTitle,
    required this.refundedCents,
    required this.caseStatus,
    required this.ownerId,
    this.caseId,
    this.postId,
    this.startsAt,
    this.endsAt,
    this.targetImpressions,
    this.audience,
    this.cancelReason,
    this.reviewedBy,
    this.cpmCents,
    this.ownerName,
    this.ownerEmail,
    this.paymentId,
    this.promoCodeId,
    this.grantedBy,
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
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int impressions;

  /// Distinct people reached.
  final int reach;
  final int clicks;

  /// Impressions the budget buys (null = no cap).
  final int? targetImpressions;
  final PromotionAudienceDto? audience;
  final String? cancelReason;
  final DateTime createdAt;

  /// Case title, or the post title / text.
  final String caseTitle;
  final String? reviewedBy;
  final int refundedCents;
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
