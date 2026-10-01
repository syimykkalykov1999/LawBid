// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conversation_counterpart_dto_kind.dart';

part 'conversation_counterpart_dto.g.dart';

@JsonSerializable()
class ConversationCounterpartDto {
  const ConversationCounterpartDto({
    required this.kind,
    required this.verifiedBadge,
    this.id,
    this.displayName,
    this.username,
    this.avatarUrl,
    this.online,
    this.lastSeenAt,
  });

  factory ConversationCounterpartDto.fromJson(Map<String, Object?> json) =>
      _$ConversationCounterpartDtoFromJson(json);

  /// null while an attorney sees the client as "Клиент по кейсу".
  final String? id;
  final ConversationCounterpartDtoKind kind;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final bool verifiedBadge;

  /// Owner 2026-10-01: online now; null = not shown (hidden activity status, anonymous client, pending request).
  final bool? online;
  final DateTime? lastSeenAt;

  Map<String, Object?> toJson() => _$ConversationCounterpartDtoToJson(this);
}
