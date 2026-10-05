// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_fee_payer.dart';
import 'payment_fee_type.dart';

part 'admin_payment_settings_dto.g.dart';

@JsonSerializable()
class AdminPaymentSettingsDto {
  const AdminPaymentSettingsDto({
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
  });

  factory AdminPaymentSettingsDto.fromJson(Map<String, Object?> json) =>
      _$AdminPaymentSettingsDtoFromJson(json);

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

  Map<String, Object?> toJson() => _$AdminPaymentSettingsDtoToJson(this);
}
