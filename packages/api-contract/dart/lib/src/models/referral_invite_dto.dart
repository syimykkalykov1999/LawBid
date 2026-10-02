// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_invite_dto_referee_role.dart';
import 'referral_reward_dto.dart';
import 'referral_status.dart';

part 'referral_invite_dto.g.dart';

@JsonSerializable()
class ReferralInviteDto {
  const ReferralInviteDto({
    required this.id,
    required this.status,
    required this.refereeRole,
    required this.reward,
    required this.createdAt,
    this.qualifiedAt,
    this.rewardedAt,
  });

  factory ReferralInviteDto.fromJson(Map<String, Object?> json) =>
      _$ReferralInviteDtoFromJson(json);

  final String id;
  final ReferralStatus status;
  final ReferralInviteDtoRefereeRole refereeRole;

  /// Your reward.
  final ReferralRewardDto reward;
  final DateTime createdAt;
  final DateTime? qualifiedAt;
  final DateTime? rewardedAt;

  Map<String, Object?> toJson() => _$ReferralInviteDtoToJson(this);
}
