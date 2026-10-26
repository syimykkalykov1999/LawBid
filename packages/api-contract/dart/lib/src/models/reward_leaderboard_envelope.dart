// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'reward_leaderboard_dto.dart';

part 'reward_leaderboard_envelope.g.dart';

@JsonSerializable()
class RewardLeaderboardEnvelope {
  const RewardLeaderboardEnvelope({required this.data, this.meta});

  factory RewardLeaderboardEnvelope.fromJson(Map<String, Object?> json) =>
      _$RewardLeaderboardEnvelopeFromJson(json);

  final RewardLeaderboardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RewardLeaderboardEnvelopeToJson(this);
}
