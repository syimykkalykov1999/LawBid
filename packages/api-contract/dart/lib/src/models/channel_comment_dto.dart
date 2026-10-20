// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_brief_dto.dart';

part 'channel_comment_dto.g.dart';

@JsonSerializable()
class ChannelCommentDto {
  const ChannelCommentDto({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
    required this.canDelete,
  });

  factory ChannelCommentDto.fromJson(Map<String, Object?> json) =>
      _$ChannelCommentDtoFromJson(json);

  final String id;
  final UserBriefDto author;
  final String body;
  final DateTime createdAt;

  /// The viewer may delete it (own, or a channel admin).
  final bool canDelete;

  Map<String, Object?> toJson() => _$ChannelCommentDtoToJson(this);
}
