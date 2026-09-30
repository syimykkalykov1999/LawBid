// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_peer_dto.dart';
import 'call_status.dart';

part 'call_dto.g.dart';

@JsonSerializable()
class CallDto {
  const CallDto({
    required this.id,
    required this.conversationId,
    required this.callerId,
    required this.calleeId,
    required this.status,
    required this.outgoing,
    required this.peer,
    required this.createdAt,
    this.answeredAt,
    this.endedAt,
    this.durationSec,
  });

  factory CallDto.fromJson(Map<String, Object?> json) =>
      _$CallDtoFromJson(json);

  final String id;
  final String conversationId;
  final String callerId;
  final String calleeId;
  final CallStatus status;

  /// The viewer placed the call.
  final bool outgoing;
  final CallPeerDto peer;
  final DateTime createdAt;
  final DateTime? answeredAt;
  final DateTime? endedAt;
  final int? durationSec;

  Map<String, Object?> toJson() => _$CallDtoToJson(this);
}
