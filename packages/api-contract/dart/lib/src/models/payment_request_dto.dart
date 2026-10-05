// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_party_dto.dart';
import 'fee_payer_party.dart';
import 'fee_payer_status.dart';
import 'payment_request_status.dart';
import 'processing_fee_payer.dart';

part 'payment_request_dto.g.dart';

@JsonSerializable()
class PaymentRequestDto {
  const PaymentRequestDto({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.amountCents,
    required this.description,
    required this.dueAt,
    required this.processingFeePayer,
    required this.processingFeeCents,
    required this.clientTotalCents,
    required this.attorneyReceivesCents,
    required this.feePayerStatus,
    required this.feePayerBy,
    required this.feePayerRounds,
    required this.feePayerMaxRounds,
    required this.canPay,
    required this.status,
    required this.overdue,
    required this.planId,
    required this.seq,
    required this.total,
    required this.paymentId,
    required this.paidAt,
    required this.createdAt,
    required this.client,
    required this.attorney,
  });

  factory PaymentRequestDto.fromJson(Map<String, Object?> json) =>
      _$PaymentRequestDtoFromJson(json);

  final String id;
  final String caseId;
  final String? caseTitle;
  final int amountCents;
  final String description;
  final DateTime? dueAt;
  final ProcessingFeePayer processingFeePayer;

  /// The client's share of Stripe's fee (estimate).
  final int processingFeeCents;

  /// What the client is charged in total (estimate).
  final int clientTotalCents;

  /// What the attorney receives after Stripe (estimate).
  final int attorneyReceivesCents;

  /// Agreed like a bid: proposed (by the attorney with the invoice), countered, agreed.
  final FeePayerStatus feePayerStatus;

  /// Who made the current proposal; the other side answers.
  final FeePayerParty feePayerBy;

  /// Counter-offers so far.
  final int feePayerRounds;

  /// Admin cap on counter-offers.
  final int feePayerMaxRounds;

  /// The client may pay now: agreed, or it is the attorney's proposal (paying accepts it).
  final bool canPay;
  final PaymentRequestStatus status;

  /// Open and past its due date.
  final bool overdue;

  /// Installment plan this belongs to.
  final String? planId;

  /// 1-based installment number.
  final int seq;

  /// Installments in the plan.
  final int total;
  final String? paymentId;
  final DateTime? paidAt;
  final DateTime createdAt;
  final CasePaymentPartyDto? client;
  final CasePaymentPartyDto? attorney;

  Map<String, Object?> toJson() => _$PaymentRequestDtoToJson(this);
}
