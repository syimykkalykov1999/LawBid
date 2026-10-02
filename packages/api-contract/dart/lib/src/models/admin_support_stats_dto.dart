// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_status_counts_dto.dart';

part 'admin_support_stats_dto.g.dart';

@JsonSerializable()
class AdminSupportStatsDto {
  const AdminSupportStatsDto({
    required this.byStatus,
    required this.openUnassigned,
    required this.unreadByAdmin,
    required this.attention,
    this.avgFirstResponseMinutes30d,
  });

  factory AdminSupportStatsDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportStatsDtoFromJson(json);

  final AdminSupportStatusCountsDto byStatus;

  /// Open tickets nobody is assigned to.
  final num openUnassigned;

  /// Not-closed tickets with an unread user message.
  final num unreadByAdmin;

  /// openUnassigned + unreadByAdmin (dashboard badge).
  final num attention;

  /// Average minutes to the first public admin reply, tickets created in the last 30 days (null = no data).
  final num? avgFirstResponseMinutes30d;

  Map<String, Object?> toJson() => _$AdminSupportStatsDtoToJson(this);
}
