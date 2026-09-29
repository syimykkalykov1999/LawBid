// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_notification_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateNotificationSettingsDto _$UpdateNotificationSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateNotificationSettingsDto(
  items: (json['items'] as List<dynamic>)
      .map((e) => CategorySettingDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$UpdateNotificationSettingsDtoToJson(
  UpdateNotificationSettingsDto instance,
) => <String, dynamic>{'items': instance.items.map((e) => e.toJson()).toList()};
