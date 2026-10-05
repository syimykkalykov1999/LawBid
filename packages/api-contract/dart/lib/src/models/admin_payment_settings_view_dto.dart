// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_fee_payer.dart';
import 'payment_fee_type.dart';
import 'processing_fee_payer.dart';

part 'admin_payment_settings_view_dto.g.dart';

@JsonSerializable()
class AdminPaymentSettingsViewDto {
  const AdminPaymentSettingsViewDto({
    required this.feeType,
    required this.feeFixedCents,
    required this.feePayer,
    required this.processingFeePayer,
    required this.processingFeePercent,
    required this.processingFeeFixedCents,
    required this.minAmountCents,
    required this.maxAmountCents,
    required this.allowCustomAmount,
    required this.allowPartial,
    required this.refundWindowDays,
    required this.saveCards,
    required this.allowInvoices,
    required this.allowInstallments,
    required this.maxInstallments,
    required this.feePayerMaxRounds,
    required this.invoiceReminderDays,
    required this.overdueReminderEveryDays,
    required this.invoiceExpireDays,
    required this.disclaimerEn,
    required this.disclaimerRu,
    required this.flagEnabled,
    required this.stripeConfigured,
  });

  factory AdminPaymentSettingsViewDto.fromJson(Map<String, Object?> json) =>
      _$AdminPaymentSettingsViewDtoFromJson(json);

  final PaymentFeeType feeType;
  final int feeFixedCents;
  final PaymentFeePayer feePayer;
  final ProcessingFeePayer processingFeePayer;
  final num processingFeePercent;
  final int processingFeeFixedCents;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;
  final int refundWindowDays;
  final bool saveCards;
  final bool allowInvoices;
  final bool allowInstallments;
  final int maxInstallments;

  /// Counter-offers allowed while agreeing who covers the Stripe fee (0 = accept or pay only).
  final int feePayerMaxRounds;

  /// Days before the due date to remind the client.
  final List<num> invoiceReminderDays;
  final int overdueReminderEveryDays;
  final int invoiceExpireDays;

  /// Legal disclaimer, English.
  final String disclaimerEn;

  /// Legal disclaimer, Russian.
  final String disclaimerRu;

  /// The payments_in_app flag.
  final bool flagEnabled;

  /// Stripe keys are configured.
  final bool stripeConfigured;

  Map<String, Object?> toJson() => _$AdminPaymentSettingsViewDtoToJson(this);
}
