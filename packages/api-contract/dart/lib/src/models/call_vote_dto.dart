// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'call_vote_dto.g.dart';

@JsonSerializable()
class CallVoteDto {
  const CallVoteDto({
    required this.id,
    required this.targetId,
    required this.startedById,
    required this.forCount,
    required this.againstCount,
    required this.voters,
    required this.expiresAt,
    required this.myBallot,
  });

  factory CallVoteDto.fromJson(Map<String, Object?> json) =>
      _$CallVoteDtoFromJson(json);

  final String id;
  final String targetId;
  final String startedById;
  final int forCount;
  final int againstCount;

  /// How many members vote (in the call, minus the candidate).
  final int voters;
  final DateTime expiresAt;

  /// The viewer's ballot (null = not voted).
  final bool? myBallot;

  Map<String, Object?> toJson() => _$CallVoteDtoToJson(this);
}
