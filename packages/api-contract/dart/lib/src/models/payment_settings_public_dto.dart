// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payment_fee_payer.dart';
import 'payment_fee_type.dart';

part 'payment_settings_public_dto.g.dart';

@JsonSerializable()
class PaymentSettingsPublicDto {
  const PaymentSettingsPublicDto({
    required this.enabled,
    required this.feeType,
    required this.feeFixedCents,
    required this.feePayer,
    required this.passProcessingFeeToClient,
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
  final bool passProcessingFeeToClient;
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
