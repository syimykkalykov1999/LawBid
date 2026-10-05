// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_fee_payer.dart';
import 'payment_fee_type.dart';
import 'processing_fee_payer.dart';

part 'payment_settings_public_dto.g.dart';

@JsonSerializable()
class PaymentSettingsPublicDto {
  const PaymentSettingsPublicDto({
    required this.enabled,
    required this.feeType,
    required this.feeFixedCents,
    required this.feePayer,
    required this.processingFeePayer,
    required this.processingFeePercent,
    required this.processingFeeFixedCents,
    required this.saveCards,
    required this.allowInvoices,
    required this.allowInstallments,
    required this.maxInstallments,
    required this.feePayerMaxRounds,
    required this.minAmountCents,
    required this.maxAmountCents,
    required this.allowCustomAmount,
    required this.allowPartial,
    required this.refundWindowDays,
    required this.disclaimerEn,
    required this.disclaimerRu,
  });

  factory PaymentSettingsPublicDto.fromJson(Map<String, Object?> json) =>
      _$PaymentSettingsPublicDtoFromJson(json);

  /// Flag on and Stripe configured: payments can be made.
  final bool enabled;
  final PaymentFeeType feeType;
  final int feeFixedCents;
  final PaymentFeePayer feePayer;
  final ProcessingFeePayer processingFeePayer;

  /// Stripe's card rate used for estimates.
  final num processingFeePercent;
  final int processingFeeFixedCents;
  final bool saveCards;
  final bool allowInvoices;
  final bool allowInstallments;
  final int maxInstallments;
  final int feePayerMaxRounds;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;
  final int refundWindowDays;

  /// Legal disclaimer, English.
  final String disclaimerEn;

  /// Legal disclaimer, Russian.
  final String disclaimerRu;

  Map<String, Object?> toJson() => _$PaymentSettingsPublicDtoToJson(this);
}
