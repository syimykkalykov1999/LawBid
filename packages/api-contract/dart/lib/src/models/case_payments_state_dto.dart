// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_payment_dto.dart';
import 'payment_request_dto.dart';
import 'processing_fee_payer.dart';

part 'case_payments_state_dto.g.dart';

@JsonSerializable()
class CasePaymentsStateDto {
  const CasePaymentsStateDto({
    required this.enabled,
    required this.attorneyReady,
    required this.canPay,
    required this.bidAmountCents,
    required this.paidCents,
    required this.refundedCents,
    required this.remainingCents,
    required this.minAmountCents,
    required this.maxAmountCents,
    required this.allowCustomAmount,
    required this.allowPartial,
    required this.processingFeePayer,
    required this.canRequest,
    required this.allowInstallments,
    required this.maxInstallments,
    required this.openRequestsCents,
    required this.requests,
    required this.items,
  });

  factory CasePaymentsStateDto.fromJson(Map<String, Object?> json) =>
      _$CasePaymentsStateDtoFromJson(json);

  /// Feature on, Stripe configured.
  final bool enabled;

  /// The attorney's payout account can receive (else the client sees a hint).
  final bool attorneyReady;

  /// The current user may start a payment on this case right now.
  final bool canPay;

  /// The accepted bid amount (null for hourly / free).
  final int? bidAmountCents;
  final int paidCents;
  final int refundedCents;

  /// Bid minus what was paid (null when no fixed bid).
  final int? remainingCents;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;

  /// The attorney's default for who covers Stripe's fee on this case.
  final ProcessingFeePayer processingFeePayer;

  /// The attorney (or their assistant) may send a payment request now.
  final bool canRequest;
  final bool allowInstallments;
  final int maxInstallments;

  /// Sum of open requests.
  final int openRequestsCents;

  /// Newest first.
  final List<PaymentRequestDto> requests;
  final List<CasePaymentDto> items;

  Map<String, Object?> toJson() => _$CasePaymentsStateDtoToJson(this);
}
