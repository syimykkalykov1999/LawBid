// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_post_dto_status.dart';

part 'admin_channel_post_dto.g.dart';

@JsonSerializable()
class AdminChannelPostDto {
  const AdminChannelPostDto({
    required this.id,
    required this.body,
    required this.status,
    required this.viewCount,
    required this.commentCount,
    required this.mediaCount,
    required this.hasVideo,
    required this.createdAt,
  });

  factory AdminChannelPostDto.fromJson(Map<String, Object?> json) =>
      _$AdminChannelPostDtoFromJson(json);

  final String id;
  final String body;
  final AdminChannelPostDtoStatus status;
  final int viewCount;
  final int commentCount;
  final int mediaCount;
  final bool hasVideo;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminChannelPostDtoToJson(this);
}
