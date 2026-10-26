// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_reward_dto.dart';
import 'referral_status.dart';

part 'referred_by_dto.g.dart';

@JsonSerializable()
class ReferredByDto {
  const ReferredByDto({required this.status, required this.reward});

  factory ReferredByDto.fromJson(Map<String, Object?> json) =>
      _$ReferredByDtoFromJson(json);

  final ReferralStatus status;

  /// Your reward.
  final ReferralRewardDto reward;

  Map<String, Object?> toJson() => _$ReferredByDtoToJson(this);
}
