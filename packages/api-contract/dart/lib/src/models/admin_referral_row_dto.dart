// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_referral_user_dto.dart';
import 'referral_reward_dto.dart';
import 'referral_status.dart';

part 'admin_referral_row_dto.g.dart';

@JsonSerializable()
class AdminReferralRowDto {
  const AdminReferralRowDto({
    required this.id,
    required this.code,
    required this.status,
    required this.referrer,
    required this.referee,
    required this.referrerRole,
    required this.refereeRole,
    required this.referrerReward,
    required this.refereeReward,
    required this.referrerRewardIssued,
    required this.refereeRewardIssued,
    required this.createdAt,
    this.qualifiedAt,
    this.rewardedAt,
    this.rejectedReason,
  });

  factory AdminReferralRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminReferralRowDtoFromJson(json);

  final String id;
  final String code;
  final ReferralStatus status;
  final AdminReferralUserDto referrer;
  final AdminReferralUserDto referee;
  final String referrerRole;
  final String refereeRole;
  final ReferralRewardDto referrerReward;
  final ReferralRewardDto refereeReward;

  /// Referrer reward already issued.
  final bool referrerRewardIssued;

  /// Referee reward already issued.
  final bool refereeRewardIssued;
  final DateTime? qualifiedAt;
  final DateTime? rewardedAt;
  final String? rejectedReason;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminReferralRowDtoToJson(this);
}
