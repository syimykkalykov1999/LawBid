// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_participant_dto.dart';
import 'call_peer_dto.dart';
import 'call_status.dart';

part 'call_dto.g.dart';

@JsonSerializable()
class CallDto {
  const CallDto({
    required this.id,
    required this.conversationId,
    required this.groupId,
    required this.callerId,
    required this.calleeId,
    required this.status,
    required this.outgoing,
    required this.peer,
    required this.participants,
    required this.createdAt,
    this.hostId,
    this.answeredAt,
    this.endedAt,
    this.durationSec,
    this.video = false,
    this.group = false,
  });

  factory CallDto.fromJson(Map<String, Object?> json) =>
      _$CallDtoFromJson(json);

  final String id;

  /// Null for a call started from a group chat.
  final String? conversationId;

  /// The group chat the call was started from (else null).
  final String? groupId;
  final String callerId;
  final String calleeId;
  final CallStatus status;

  /// The viewer placed the call.
  final bool outgoing;

  /// Owner 2026-10-05: cameras on (false = audio only).
  final bool video;
  final CallPeerDto peer;

  /// Owner 2026-10-20: people were added; `participants` lists everyone.
  final bool group;

  /// Who can mute / remove others (group calls).
  final String? hostId;
  final List<CallParticipantDto> participants;
  final DateTime createdAt;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final int? durationSec;

  Map<String, Object?> toJson() => _$CallDtoToJson(this);
}
