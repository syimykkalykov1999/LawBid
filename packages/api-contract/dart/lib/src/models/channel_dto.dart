// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_role.dart';
import 'channel_status.dart';
import 'ongoing_call_dto.dart';
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
    this.mutedUntil,
    this.isPinned,
    this.isArchived,
    this.myRole,
    this.lastPostAt,
    this.ongoingCall,
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

  /// Hidden / banned are only reported to the channel's admins.
  final ChannelStatus status;
  final int subscriberCount;
  final int postCount;
  final UserBriefDto owner;
  final bool isSubscribed;
  final bool isMuted;

  /// Muted until this moment (null: not timed; «forever» is isMuted).
  final DateTime? mutedUntil;

  /// Pinned to the top of my list.
  final bool? isPinned;

  /// In my channels' Archive.
  final bool? isArchived;

  /// My role in the channel, null for a plain reader.
  final ChannelRole? myRole;
  final DateTime? lastPostAt;
  final DateTime createdAt;

  /// Owner 2026-10-21 (Telegram «Видеочат»): the call running in the channel now (subscribers and admins).
  final OngoingCallDto? ongoingCall;

  Map<String, Object?> toJson() => _$ChannelDtoToJson(this);
}
