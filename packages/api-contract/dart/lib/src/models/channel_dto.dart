// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_role.dart';
import 'channel_status.dart';
import 'channel_who.dart';
import 'reaction_mode.dart';
import 'user_brief_dto.dart';

part 'channel_dto.g.dart';

@JsonSerializable()
class ChannelDto {
  const ChannelDto({
    required this.id,
    required this.title,
    required this.username,
    required this.commentsEnabled,
    required this.status,
    required this.subscriberCount,
    required this.postCount,
    required this.owner,
    required this.isSubscribed,
    required this.isMuted,
    required this.createdAt,
    this.description,
    this.avatarUrl,
    this.avatarFullUrl,
    this.protectContent,
    this.whoCanPost,
    this.canPost,
    this.reactionsMode,
    this.reactionsAllowed,
    this.myRole,
    this.lastPostAt,
  });

  factory ChannelDto.fromJson(Map<String, Object?> json) =>
      _$ChannelDtoFromJson(json);

  final String id;
  final String title;

  /// Lowercase, without @.
  final String username;
  final String? description;
  final String? avatarUrl;

  /// The full-size picture for the full-screen view.
  final String? avatarFullUrl;
  final bool commentsEnabled;

  /// Owner 2026-10-21 (Telegram): restrict saving content — no.
  /// forwarding, copying or saving of the posts; sharing sends the link.
  final bool? protectContent;

  /// Owner 2026-10-21 (inbox 26b): who publishes posts.
  final ChannelWho? whoCanPost;

  /// I may publish here: an admin, or a subscriber while it is open to all.
  final bool? canPost;

  /// Owner 2026-10-21 (inbox 26b): all / selected / off.
  final ReactionMode? reactionsMode;

  /// The selected reactions (mode «some»), palette order.
  final List<String>? reactionsAllowed;

  /// Hidden / banned are only reported to the channel's admins.
  final ChannelStatus status;
  final int subscriberCount;
  final int postCount;
  final UserBriefDto owner;
  final bool isSubscribed;
  final bool isMuted;

  /// My role in the channel, null for a plain reader.
  final ChannelRole? myRole;
  final DateTime? lastPostAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$ChannelDtoToJson(this);
}
