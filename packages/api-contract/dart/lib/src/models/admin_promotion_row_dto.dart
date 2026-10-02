// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_promotion_status.dart';

part 'admin_promotion_row_dto.g.dart';

@JsonSerializable()
class AdminPromotionRowDto {
  const AdminPromotionRowDto({
    required this.id,
    required this.caseId,
    required this.status,
    required this.days,
    required this.priceCentsPerDay,
    required this.totalCents,
    required this.impressions,
    required this.createdAt,
    required this.caseTitle,
    required this.caseStatus,
    required this.ownerId,
    this.startsAt,
    this.endsAt,
    this.ownerName,
    this.ownerEmail,
    this.paymentId,
    this.promoCodeId,
    this.grantedBy,
    this.cancelReason,
  });

  factory AdminPromotionRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminPromotionRowDtoFromJson(json);

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
  final String caseTitle;
  final String caseStatus;
  final String ownerId;
  final String? ownerName;
  final String? ownerEmail;
  final String? paymentId;
  final String? promoCodeId;
  final String? grantedBy;
  final String? cancelReason;

  Map<String, Object?> toJson() => _$AdminPromotionRowDtoToJson(this);
}
