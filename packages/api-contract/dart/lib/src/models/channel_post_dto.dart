// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_media_dto.dart';
import 'channel_reaction_count_dto.dart';
import 'post_video_dto.dart';
import 'user_brief_dto.dart';

part 'channel_post_dto.g.dart';

@JsonSerializable()
class ChannelPostDto {
  const ChannelPostDto({
    required this.id,
    required this.channelId,
    required this.author,
    required this.body,
    required this.media,
    required this.viewCount,
    required this.commentCount,
    required this.shareCount,
    required this.reactions,
    required this.createdAt,
    this.video,
    this.myReaction,
    this.editedAt,
    this.forwardedFrom,
    this.mine,
  });

  factory ChannelPostDto.fromJson(Map<String, Object?> json) =>
      _$ChannelPostDtoFromJson(json);

  final String id;
  final String channelId;
  final UserBriefDto author;
  final String body;
  final List<ChannelMediaDto> media;
  final PostVideoDto? video;
  final int viewCount;
  final int commentCount;
  final int shareCount;
  final List<ChannelReactionCountDto> reactions;
  final String? myReaction;
  final DateTime createdAt;
  final DateTime? editedAt;

  /// Owner 2026-10-21: a forwarded post — «Forwarded from <name>».
  final String? forwardedFrom;

  /// I wrote it (I may edit and delete it).
  final bool? mine;

  Map<String, Object?> toJson() => _$ChannelPostDtoToJson(this);
}
