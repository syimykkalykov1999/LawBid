// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payroll_fee_settings_dto.g.dart';

@JsonSerializable()
class PayrollFeeSettingsDto {
  const PayrollFeeSettingsDto({
    required this.percent,
    required this.fixedCents,
    required this.monthlyCents,
  });

  factory PayrollFeeSettingsDto.fromJson(Map<String, Object?> json) =>
      _$PayrollFeeSettingsDtoFromJson(json);

  /// Percent of each payout.
  final num percent;
  final int fixedCents;

  /// Once a period per person paid through Stripe.
  final int monthlyCents;

  Map<String, Object?> toJson() => _$PayrollFeeSettingsDtoToJson(this);
}
