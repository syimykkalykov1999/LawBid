// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_fee_payer.dart';
import 'payment_fee_type.dart';
import 'processing_fee_payer.dart';

part 'payment_quote_dto.g.dart';

@JsonSerializable()
class PaymentQuoteDto {
  const PaymentQuoteDto({
    required this.amountCents,
    required this.platformFeeCents,
    required this.processingFeeCents,
    required this.clientTotalCents,
    required this.attorneyNetCents,
    required this.stripeFeeEstimateCents,
    required this.attorneyReceivesCents,
    required this.feeType,
    required this.feePayer,
    required this.processingFeePayer,
  });

  factory PaymentQuoteDto.fromJson(Map<String, Object?> json) =>
      _$PaymentQuoteDtoFromJson(json);

  /// The attorney's fee paid.
  final int amountCents;
  final int platformFeeCents;
  final int processingFeeCents;

  /// Charged to the card.
  final int clientTotalCents;

  /// Lands on the attorney.
  final int attorneyNetCents;

  /// Stripe's card fee on the whole charge (estimate).
  final int stripeFeeEstimateCents;

  /// What the attorney keeps after Stripe (estimate).
  final int attorneyReceivesCents;
  final PaymentFeeType feeType;
  final PaymentFeePayer feePayer;
  final ProcessingFeePayer processingFeePayer;

  Map<String, Object?> toJson() => _$PaymentQuoteDtoToJson(this);
}
