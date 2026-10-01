// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_offer_dto.dart';
import 'bid_status.dart';
import 'fee_type.dart';
import 'party_role.dart';
import 'start_availability.dart';

part 'bid_dto.g.dart';

@JsonSerializable()
class BidDto {
  const BidDto({
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
    required this.outsidePractice,
    required this.createdAt,
    required this.offers,
  });

  factory BidDto.fromJson(Map<String, Object?> json) => _$BidDtoFromJson(json);

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

  /// Owner 2026-09-30: the case's practice is outside the attorney's.
  /// own — the client is told to discuss it first.
  final bool outsidePractice;
  final DateTime createdAt;
  final List<BidOfferDto> offers;

  Map<String, Object?> toJson() => _$BidDtoToJson(this);
}
