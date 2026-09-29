// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category_setting_view_dto.dart';
import 'quiet_hours_dto.dart';

part 'notification_settings_dto.g.dart';

@JsonSerializable()
class NotificationSettingsDto {
  const NotificationSettingsDto({required this.categories, this.quietHours});

  factory NotificationSettingsDto.fromJson(Map<String, Object?> json) =>
      _$NotificationSettingsDtoFromJson(json);

  final List<CategorySettingViewDto> categories;
  final QuietHoursDto? quietHours;

  Map<String, Object?> toJson() => _$NotificationSettingsDtoToJson(this);
}
