// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payout_account_status.dart';
import 'processing_fee_payer.dart';

part 'payout_account_dto.g.dart';

@JsonSerializable()
class PayoutAccountDto {
  const PayoutAccountDto({
    required this.status,
    required this.canReceive,
    required this.chargesEnabled,
    required this.payoutsEnabled,
    required this.detailsSubmitted,
    required this.requirementsDue,
    required this.disabledReason,
    required this.available,
    required this.processingFeePayer,
    required this.processingFeePayerIsDefault,
    required this.updatedAt,
  });

  factory PayoutAccountDto.fromJson(Map<String, Object?> json) =>
      _$PayoutAccountDtoFromJson(json);

  /// none = the attorney has not started.
  final PayoutAccountStatus status;

  /// Clients can pay this attorney now.
  final bool canReceive;
  final bool chargesEnabled;
  final bool payoutsEnabled;
  final bool detailsSubmitted;

  /// Stripe requirement keys.
  final List<String> requirementsDue;
  final String? disabledReason;

  /// The payments feature is on and Stripe is configured.
  final bool available;

  /// The attorney's default for who covers Stripe's fee.
  final ProcessingFeePayer processingFeePayer;

  /// True while the attorney has not chosen (admin default).
  final bool processingFeePayerIsDefault;
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$PayoutAccountDtoToJson(this);
}
