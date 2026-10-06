// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'treasury_setup_dto.g.dart';

@JsonSerializable()
class TreasurySetupDto {
  const TreasurySetupDto({
    required this.stripeConnected,
    required this.manualPayouts,
    required this.payoutInterval,
    required this.banksListed,
    required this.bankCount,
    required this.separateExpenseBank,
  });

  factory TreasurySetupDto.fromJson(Map<String, Object?> json) =>
      _$TreasurySetupDtoFromJson(json);

  /// Stripe keys are saved (or the dev stand-in).
  final bool stripeConnected;

  /// Stripe payouts are on «Manual», so LawBid decides when.
  final bool manualPayouts;
  final String? payoutInterval;

  /// Stripe listed the banks.
  final bool banksListed;
  final int bankCount;

  /// A second bank (not the default) is in Stripe for «Расходы». Stripe allows one USD bank, so usually false: the expense payout goes to the default bank as its own payout.
  final bool separateExpenseBank;

  Map<String, Object?> toJson() => _$TreasurySetupDtoToJson(this);
}
