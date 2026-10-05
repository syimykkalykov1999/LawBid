// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'storage_image_format.dart';

part 'storage_settings_dto.g.dart';

@JsonSerializable()
class StorageSettingsDto {
  const StorageSettingsDto({
    required this.dedup,
    required this.autoCleanup,
    required this.orphanGraceHours,
    required this.purgeAfterDays,
    required this.deletedPostsMediaDays,
    required this.imageFormat,
    required this.userQuotaMb,
    required this.chatQuotaMb,
    required this.autoRetention,
    required this.retentionAuthEventsDays,
    required this.retentionAssistantActivityDays,
    required this.notificationsRetentionDays,
    required this.growthAlertPercent,
  });

  factory StorageSettingsDto.fromJson(Map<String, Object?> json) =>
      _$StorageSettingsDtoFromJson(json);

  /// Identical uploads share one stored copy.
  final bool dedup;

  /// Files nobody uses are removed by themselves.
  final bool autoCleanup;
  final num orphanGraceHours;
  final num purgeAfterDays;
  final num deletedPostsMediaDays;
  final StorageImageFormat imageFormat;

  /// MB per user; 0 = no cap.
  final num userQuotaMb;

  /// MB of files per chat; 0 = no cap.
  final num chatQuotaMb;

  /// Old technical logs are removed nightly.
  final bool autoRetention;

  /// Days; 0 = keep forever.
  final num retentionAuthEventsDays;

  /// Days; 0 = keep forever.
  final num retentionAssistantActivityDays;

  /// Days a notification is kept.
  final num notificationsRetentionDays;

  /// Alert when storage grows this % in a day.
  final num growthAlertPercent;

  Map<String, Object?> toJson() => _$StorageSettingsDtoToJson(this);
}
