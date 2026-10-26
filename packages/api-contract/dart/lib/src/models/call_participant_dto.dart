// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_participant_dto_sfu_tracks.dart';
import 'call_participant_status.dart';

part 'call_participant_dto.g.dart';

@JsonSerializable()
class CallParticipantDto {
  const CallParticipantDto({
    required this.userId,
    required this.status,
    required this.muted,
    required this.mutedByHost,
    this.displayName,
    this.username,
    this.avatarUrl,
    this.joinedAt,
    this.sfuReady,
    this.sfuTracks,
  });

  factory CallParticipantDto.fromJson(Map<String, Object?> json) =>
      _$CallParticipantDtoFromJson(json);

  final String userId;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final CallParticipantStatus status;

  /// The microphone is off (their own or the host).
  final bool muted;

  /// The host switched the microphone off.
  final bool mutedByHost;

  /// When they joined; the later joiner offers WebRTC.
  final DateTime? joinedAt;

  /// Cloudflare SFU calls only: this person publishes at least one track, so pull them (POST /calls/:id/sfu/subscribe).
  final bool? sfuReady;

  /// Cloudflare SFU calls only: the tracks this person publishes now.
  final List<CallParticipantDtoSfuTracks>? sfuTracks;

  Map<String, Object?> toJson() => _$CallParticipantDtoToJson(this);
}
