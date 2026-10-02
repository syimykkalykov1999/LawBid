// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_promotion_status.dart';

part 'case_promotion_dto.g.dart';

@JsonSerializable()
class CasePromotionDto {
  const CasePromotionDto({
    required this.id,
    required this.caseId,
    required this.status,
    required this.days,
    required this.priceCentsPerDay,
    required this.totalCents,
    required this.impressions,
    required this.createdAt,
    this.startsAt,
    this.endsAt,
  });

  factory CasePromotionDto.fromJson(Map<String, Object?> json) =>
      _$CasePromotionDtoFromJson(json);

  final String id;
  final String caseId;
  final CasePromotionStatus status;
  final int days;
  final int priceCentsPerDay;

  /// Charged amount.
  final int totalCents;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int impressions;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$CasePromotionDtoToJson(this);
}
