// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_attorney_summary_dto.dart';
import 'bid_status.dart';
import 'fee_type.dart';
import 'party_role.dart';
import 'payment_terms_dto.dart';
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
    required this.version,
    required this.turn,
    required this.decidedAt,
    required this.outsidePractice,
    required this.outsideLicensedStates,
    required this.createdAt,
    required this.attorney,
    required this.bestPrice,
    required this.lowOffer,
    this.paymentTerms,
    this.percentBps,
  });

  factory CaseBidItemDto.fromJson(Map<String, Object?> json) =>
      _$CaseBidItemDtoFromJson(json);

  final String id;
  final String caseId;
  final String attorneyId;
  final BidStatus status;
  final FeeType feeType;
  final int amountCents;

  /// Deal record 2026-10-27: rich payment terms of the current round, if any.
  final PaymentTermsDto? paymentTerms;

  /// Owner 2026-10-17: contingency → basis points (3300 = 33 %).
  final int? percentBps;
  final String message;
  final StartAvailability startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;
  final int roundCount;

  /// Send it back as `If-Match` on a counter to detect a concurrent change (409 STALE_VERSION).
  final int version;
  final PartyRole turn;
  final DateTime? decidedAt;

  /// Owner 2026-09-30: the case's practice is outside the attorney's.
  /// own — the client is told to discuss it first.
  final bool outsidePractice;

  /// Owner 2026-10-04: the attorney holds no verified licence in the.
  /// case's states — bidding is allowed, the client is told.
  final bool outsideLicensedStates;
  final DateTime createdAt;
  final BidAttorneySummaryDto attorney;

  /// Owner 2026-10-25: the lowest reasonable price on the case (suspiciously low bids excluded). For a later "best price" label.
  final bool bestPrice;

  /// Owner 2026-10-25: far below the case median (setting bids.dumping_guard on); false when the guard is off.
  final bool lowOffer;

  Map<String, Object?> toJson() => _$CaseBidItemDtoToJson(this);
}
