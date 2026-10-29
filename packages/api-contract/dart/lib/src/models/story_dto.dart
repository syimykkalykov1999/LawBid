// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_video_dto.dart';
import 'story_audience.dart';
import 'story_kind.dart';
import 'story_overlay_dto.dart';
import 'user_brief_dto.dart';

part 'story_dto.g.dart';

@JsonSerializable()
class StoryDto {
  const StoryDto({
    required this.id,
    required this.author,
    required this.kind,
    required this.overlays,
    required this.audience,
    required this.createdAt,
    required this.expiresAt,
    required this.viewedByMe,
    required this.isMine,
    required this.viewCount,
    required this.canReply,
    this.mediaUrl,
    this.previewUrl,
    this.video,
    this.text,
    this.background,
  });
  
  factory StoryDto.fromJson(Map<String, Object?> json) => _$StoryDtoFromJson(json);
  
  final String id;
  final UserBriefDto author;
  final StoryKind kind;

  /// photo: 1080 px link.
  final String? mediaUrl;

  /// photo: 320 px link (archive grid).
  final String? previewUrl;
  final PostVideoDto? video;
  final String? text;
  final String? background;
  final List<StoryOverlayDto> overlays;
  final StoryAudience audience;
  final DateTime createdAt;
  final DateTime expiresAt;

  /// Seen by the viewer already.
  final bool viewedByMe;
  final bool isMine;

  /// Views — only for the author, otherwise 0.
  final int viewCount;

  /// The viewer may answer in a chat with the author.
  final bool canReply;

  Map<String, Object?> toJson() => _$StoryDtoToJson(this);
}
