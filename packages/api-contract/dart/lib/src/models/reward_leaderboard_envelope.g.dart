// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reward_leaderboard_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardLeaderboardEnvelope _$RewardLeaderboardEnvelopeFromJson(
  Map<String, dynamic> json,
) => RewardLeaderboardEnvelope(
  data: RewardLeaderboardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RewardLeaderboardEnvelopeToJson(
  RewardLeaderboardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
