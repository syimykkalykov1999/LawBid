// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_reward_type.dart';

part 'referral_reward_dto.g.dart';

@JsonSerializable()
class ReferralRewardDto {
  const ReferralRewardDto({
    required this.type,
    required this.value,
    this.amount,
  });

  factory ReferralRewardDto.fromJson(Map<String, Object?> json) =>
      _$ReferralRewardDtoFromJson(json);

  final ReferralRewardType type;

  /// balance_cents: cents of credit; percent_first_invoice: percent; promotion_days: whole days (see amount).
  final int value;

  /// Exact value (owner 2026-10-05): promotion_days may be fractional, up to 2 decimals (0.5 = 12 hours). Always set in responses; in requests it wins over value.
  final num? amount;

  Map<String, Object?> toJson() => _$ReferralRewardDtoToJson(this);
}
