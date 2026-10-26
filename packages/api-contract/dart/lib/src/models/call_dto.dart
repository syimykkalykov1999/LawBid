// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_dto_media_provider.dart';
import 'call_media_fallback_dto.dart';
import 'call_participant_dto.dart';
import 'call_peer_dto.dart';
import 'call_status.dart';
import 'call_vote_dto.dart';

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
    this.video = false,
    this.group = false,
    this.moderated = false,
    this.channelId,
    this.mediaProvider,
    this.mediaFallback,
    this.hostId,
    this.vote,
    this.answeredAt,
    this.endedAt,
    this.durationSec,
  });

  factory CallDto.fromJson(Map<String, Object?> json) =>
      _$CallDtoFromJson(json);

  final String id;

  /// Null for a call started from a group chat.
  final String? conversationId;

  /// The group chat the call was started from (else null).
  final String? groupId;

  /// Owner 2026-10-21 (inbox 20e): the channel the call belongs to (else null).
  final String? channelId;
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

  /// Owner 2026-10-24: how the media of this call is carried, fixed at its start. cloudflare = Cloudflare SFU (use POST /calls/:id/sfu/*); p2p = device to device (1:1 calls and the fallback).
  final CallDtoMediaProvider? mediaProvider;

  /// Owner 2026-10-24: set on group calls only; see CallMediaFallbackDto. Also sent with every call:participants event.
  final CallMediaFallbackDto? mediaFallback;

  /// Who can mute / remove others (group calls).
  final String? hostId;
  final List<CallParticipantDto> participants;

  /// Somebody who runs the call (the starter or a group admin) is in it: members cannot vote to remove anyone then.
  final bool moderated;
  final CallVoteDto? vote;
  final DateTime createdAt;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final int? durationSec;

  Map<String, Object?> toJson() => _$CallDtoToJson(this);
}
