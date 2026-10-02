// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_reward_dto.dart';

part 'referral_settings_dto.g.dart';

@JsonSerializable()
class ReferralSettingsDto {
  const ReferralSettingsDto({
    required this.enabled,
    required this.attorneyReferrerReward,
    required this.attorneyRefereeReward,
    required this.clientReferrerReward,
    required this.clientRefereeReward,
    this.applyWindowDays = 14,
  });

  factory ReferralSettingsDto.fromJson(Map<String, Object?> json) =>
      _$ReferralSettingsDtoFromJson(json);

  final bool enabled;

  /// Attorney who invited (balance_cents).
  final ReferralRewardDto attorneyReferrerReward;

  /// Invited attorney (percent_first_invoice or balance_cents); qualifies on the first paid invoice.
  final ReferralRewardDto attorneyRefereeReward;

  /// Client who invited (promotion_days).
  final ReferralRewardDto clientReferrerReward;

  /// Invited client (promotion_days); qualifies on the first case.
  final ReferralRewardDto clientRefereeReward;
  final int applyWindowDays;

  Map<String, Object?> toJson() => _$ReferralSettingsDtoToJson(this);
}
