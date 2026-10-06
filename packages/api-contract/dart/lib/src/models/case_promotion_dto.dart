// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

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
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.createdAt,
    this.caseId,
    this.postId,
    this.startsAt,
    this.endsAt,
    this.targetImpressions,
    this.audience,
    this.cancelReason,
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

  Map<String, Object?> toJson() => _$CasePromotionDtoToJson(this);
}
