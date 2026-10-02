// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_reward_type.dart';

part 'referral_reward_dto.g.dart';

@JsonSerializable()
class ReferralRewardDto {
  const ReferralRewardDto({required this.type, required this.value});

  factory ReferralRewardDto.fromJson(Map<String, Object?> json) =>
      _$ReferralRewardDtoFromJson(json);

  final ReferralRewardType type;

  /// balance_cents: cents of credit; percent_first_invoice: percent; promotion_days: days.
  final int value;

  Map<String, Object?> toJson() => _$ReferralRewardDtoToJson(this);
}
