// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_kind.dart';
import 'case_payment_party_dto.dart';
import 'case_payment_status.dart';
import 'processing_fee_payer.dart';

part 'case_payment_dto.g.dart';

@JsonSerializable()
class CasePaymentDto {
  const CasePaymentDto({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.kind,
    required this.requestId,
    required this.status,
    required this.amountCents,
    required this.platformFeeCents,
    required this.processingFeeCents,
    required this.clientTotalCents,
    required this.attorneyNetCents,
    required this.processingFeePayer,
    required this.refundedCents,
    required this.currency,
    required this.note,
    required this.receiptUrl,
    required this.disputeStatus,
    required this.paidAt,
    required this.createdAt,
    required this.client,
    required this.attorney,
    required this.refundable,
  });

  factory CasePaymentDto.fromJson(Map<String, Object?> json) =>
      _$CasePaymentDtoFromJson(json);

  final String id;
  final String caseId;
  final String? caseTitle;
  final CasePaymentKind kind;

  /// The payment request this pays (kind = invoice).
  final String? requestId;
  final CasePaymentStatus status;
  final int amountCents;
  final int platformFeeCents;
  final int processingFeeCents;
  final int clientTotalCents;
  final int attorneyNetCents;
  final ProcessingFeePayer processingFeePayer;
  final int refundedCents;
  final String currency;
  final String? note;

  /// Stripe receipt.
  final String? receiptUrl;
  final String? disputeStatus;
  final DateTime? paidAt;
  final DateTime createdAt;
  final CasePaymentPartyDto? client;
  final CasePaymentPartyDto? attorney;

  /// The attorney (or admin) may still refund part of it.
  final bool refundable;

  Map<String, Object?> toJson() => _$CasePaymentDtoToJson(this);
}
