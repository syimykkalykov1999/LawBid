// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_fee_payer.dart';
import 'payment_fee_type.dart';

part 'admin_payment_settings_view_dto.g.dart';

@JsonSerializable()
class AdminPaymentSettingsViewDto {
  const AdminPaymentSettingsViewDto({
    required this.feeType,
    required this.feeFixedCents,
    required this.feePercent,
    required this.feePayer,
    required this.passProcessingFeeToClient,
    required this.processingFeePercent,
    required this.processingFeeFixedCents,
    required this.minAmountCents,
    required this.maxAmountCents,
    required this.allowCustomAmount,
    required this.allowPartial,
    required this.refundWindowDays,
    required this.flagEnabled,
    required this.stripeConfigured,
    required this.feeSharingWarning,
  });

  factory AdminPaymentSettingsViewDto.fromJson(Map<String, Object?> json) =>
      _$AdminPaymentSettingsViewDtoFromJson(json);

  final PaymentFeeType feeType;
  final int feeFixedCents;
  final num feePercent;
  final PaymentFeePayer feePayer;
  final bool passProcessingFeeToClient;
  final num processingFeePercent;
  final int processingFeeFixedCents;
  final int minAmountCents;
  final int maxAmountCents;
  final bool allowCustomAmount;
  final bool allowPartial;
  final int refundWindowDays;

  /// The payments_in_app flag.
  final bool flagEnabled;

  /// Stripe keys are configured.
  final bool stripeConfigured;

  /// feeType = percent: a share of an attorney fee may be fee-sharing (ABA 5.4).
  final bool feeSharingWarning;

  Map<String, Object?> toJson() => _$AdminPaymentSettingsViewDtoToJson(this);
}
