// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_message_dto.dart';

part 'group_topic_dto.g.dart';

@JsonSerializable()
class GroupTopicDto {
  const GroupTopicDto({
    required this.id,
    required this.title,
    required this.color,
    required this.isGeneral,
    required this.closed,
    required this.pinned,
    required this.unreadCount,
    required this.unreadMentions,
    required this.createdAt,
    this.iconEmoji,
    this.lastMessage,
    this.lastMessageAt,
  });

  factory GroupTopicDto.fromJson(Map<String, Object?> json) =>
      _$GroupTopicDtoFromJson(json);

  final String id;

  /// For «General» the app shows its own localized name.
  final String title;
  final String? iconEmoji;

  /// Palette index 0–6.
  final num color;
  final bool isGeneral;
  final bool closed;
  final bool pinned;
  final GroupMessageDto? lastMessage;
  final DateTime? lastMessageAt;
  final num unreadCount;
  final num unreadMentions;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$GroupTopicDtoToJson(this);
}
