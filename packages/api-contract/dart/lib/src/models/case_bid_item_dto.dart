// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_attorney_summary_dto.dart';
import 'bid_status.dart';
import 'fee_type.dart';
import 'party_role.dart';
import 'start_availability.dart';

part 'case_bid_item_dto.g.dart';

@JsonSerializable()
class CaseBidItemDto {
  const CaseBidItemDto({
    required this.id,
    required this.caseId,
    required this.attorneyId,
    required this.status,
    required this.feeType,
    required this.amountCents,
    required this.message,
    required this.startAvailability,
    required this.startDate,
    required this.estimatedDurationDays,
    required this.roundCount,
    required this.turn,
    required this.decidedAt,
    required this.createdAt,
    required this.attorney,
  });

  factory CaseBidItemDto.fromJson(Map<String, Object?> json) =>
      _$CaseBidItemDtoFromJson(json);

  final String id;
  final String caseId;
  final String attorneyId;
  final BidStatus status;
  final FeeType feeType;
  final int amountCents;
  final String message;
  final StartAvailability startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;
  final int roundCount;
  final PartyRole turn;
  final DateTime? decidedAt;
  final DateTime createdAt;
  final BidAttorneySummaryDto attorney;

  Map<String, Object?> toJson() => _$CaseBidItemDtoToJson(this);
}
