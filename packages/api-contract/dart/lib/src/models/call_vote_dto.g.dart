// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_vote_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallVoteDto _$CallVoteDtoFromJson(Map<String, dynamic> json) => CallVoteDto(
  id: json['id'] as String,
  targetId: json['targetId'] as String,
  startedById: json['startedById'] as String,
  forCount: (json['forCount'] as num).toInt(),
  againstCount: (json['againstCount'] as num).toInt(),
  voters: (json['voters'] as num).toInt(),
  expiresAt: DateTime.parse(json['expiresAt'] as String),
  myBallot: json['myBallot'] as bool?,
);

Map<String, dynamic> _$CallVoteDtoToJson(CallVoteDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'targetId': instance.targetId,
      'startedById': instance.startedById,
      'forCount': instance.forCount,
      'againstCount': instance.againstCount,
      'voters': instance.voters,
      'expiresAt': instance.expiresAt.toIso8601String(),
      'myBallot': ?instance.myBallot,
    };
