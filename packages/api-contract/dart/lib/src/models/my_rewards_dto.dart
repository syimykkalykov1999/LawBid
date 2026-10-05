// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_reward_rank_dto.dart';
import 'reward_award_dto.dart';

part 'my_rewards_dto.g.dart';

@JsonSerializable()
class MyRewardsDto {
  const MyRewardsDto({
    required this.enabled,
    required this.ranks,
    required this.awards,
    this.period,
  });

  factory MyRewardsDto.fromJson(Map<String, Object?> json) =>
      _$MyRewardsDtoFromJson(json);

  /// false = the section does not exist for staff.
  final bool enabled;
  final String? period;
  final List<MyRewardRankDto> ranks;

  /// My latest prizes.
  final List<RewardAwardDto> awards;

  Map<String, Object?> toJson() => _$MyRewardsDtoToJson(this);
}
