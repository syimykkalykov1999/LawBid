// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_history_status.dart';
import 'call_peer_dto.dart';

part 'call_history_item_dto.g.dart';

@JsonSerializable()
class CallHistoryItemDto {
  const CallHistoryItemDto({
    required this.id,
    required this.status,
    required this.outgoing,
    required this.video,
    required this.peer,
    required this.createdAt,
    this.group = false,
    this.conversationId,
    this.groupId,
    this.groupTitle,
    this.groupAvatarUrl,
    this.durationSec,
  });

  factory CallHistoryItemDto.fromJson(Map<String, Object?> json) =>
      _$CallHistoryItemDtoFromJson(json);

  final String id;
  final CallHistoryStatus status;

  /// The viewer placed the call.
  final bool outgoing;
  final bool video;
  final CallPeerDto peer;
  final String? conversationId;

  /// The group chat the call was started from (else null).
  final String? groupId;
  final String? groupTitle;
  final String? groupAvatarUrl;
  final bool group;
  final DateTime createdAt;
  final int? durationSec;

  Map<String, Object?> toJson() => _$CallHistoryItemDtoToJson(this);
}
