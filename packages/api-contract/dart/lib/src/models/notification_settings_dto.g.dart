// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'notification_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NotificationSettingsDto _$NotificationSettingsDtoFromJson(
  Map<String, dynamic> json,
) => NotificationSettingsDto(
  categories: (json['categories'] as List<dynamic>)
      .map((e) => CategorySettingViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  quietHours: json['quietHours'] == null
      ? null
      : QuietHoursDto.fromJson(json['quietHours'] as Map<String, dynamic>),
);

Map<String, dynamic> _$NotificationSettingsDtoToJson(
  NotificationSettingsDto instance,
) => <String, dynamic>{
  'categories': instance.categories.map((e) => e.toJson()).toList(),
  'quietHours': ?instance.quietHours?.toJson(),
};
