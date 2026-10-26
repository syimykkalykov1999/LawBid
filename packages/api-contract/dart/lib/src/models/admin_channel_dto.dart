// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_post_dto.dart';
import 'admin_channel_status.dart';

part 'admin_channel_dto.g.dart';

@JsonSerializable()
class AdminChannelDto {
  const AdminChannelDto({
    required this.id,
    required this.title,
    required this.username,
    required this.ownerId,
    required this.ownerName,
    required this.status,
    required this.subscriberCount,
    required this.postCount,
    required this.openReports,
    required this.createdAt,
    required this.posts,
    this.moderationNote,
    this.lastPostAt,
    this.description,
  });

  factory AdminChannelDto.fromJson(Map<String, Object?> json) =>
      _$AdminChannelDtoFromJson(json);

  final String id;
  final String title;
  final String username;
  final String ownerId;
  final String ownerName;
  final AdminChannelStatus status;
  final int subscriberCount;
  final int postCount;

  /// Open reports on the channel and on its posts.
  final int openReports;
  final String? moderationNote;
  final DateTime? lastPostAt;
  final DateTime createdAt;
  final String? description;

  /// The latest posts, newest first (up to 30).
  final List<AdminChannelPostDto> posts;

  Map<String, Object?> toJson() => _$AdminChannelDtoToJson(this);
}
