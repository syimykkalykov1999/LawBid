// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category_setting_view_dto.dart';
import 'quiet_hours_dto.dart';
import 'topic_setting_view_dto.dart';

part 'notification_settings_dto.g.dart';

@JsonSerializable()
class NotificationSettingsDto {
  const NotificationSettingsDto({
    required this.categories,
    required this.iconBadge,
    required this.topics,
    this.quietHours,
  });

  factory NotificationSettingsDto.fromJson(Map<String, Object?> json) =>
      _$NotificationSettingsDtoFromJson(json);

  final List<CategorySettingViewDto> categories;
  final QuietHoursDto? quietHours;

  /// Owner 2026-10-21: the unread number on the app icon (default true).
  final bool iconBadge;

  /// Owner 2026-10-21: a switch per kind of notification, in screen order.
  final List<TopicSettingViewDto> topics;

  Map<String, Object?> toJson() => _$NotificationSettingsDtoToJson(this);
}
