// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_status.dart';

part 'admin_channel_row_dto.g.dart';

@JsonSerializable()
class AdminChannelRowDto {
  const AdminChannelRowDto({
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
    this.moderationNote,
    this.lastPostAt,
  });

  factory AdminChannelRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminChannelRowDtoFromJson(json);

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

  Map<String, Object?> toJson() => _$AdminChannelRowDtoToJson(this);
}
