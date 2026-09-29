// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category_setting_dto.dart';

part 'update_notification_settings_dto.g.dart';

@JsonSerializable()
class UpdateNotificationSettingsDto {
  const UpdateNotificationSettingsDto({required this.items});

  factory UpdateNotificationSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateNotificationSettingsDtoFromJson(json);

  final List<CategorySettingDto> items;

  Map<String, Object?> toJson() => _$UpdateNotificationSettingsDtoToJson(this);
}
