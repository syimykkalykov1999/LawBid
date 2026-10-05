// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_support_desk_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateSupportDeskSettingsDto _$UpdateSupportDeskSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdateSupportDeskSettingsDto(
  autoAssign: json['autoAssign'] as bool?,
  slaFirstResponseMinutes: json['slaFirstResponseMinutes'] as num?,
  slaUrgentMinutes: json['slaUrgentMinutes'] as num?,
  slaAlerts: json['slaAlerts'] as bool?,
  escalateOnBreach: json['escalateOnBreach'] as bool?,
  alwaysOpen: json['alwaysOpen'] as bool?,
  openDays: (json['openDays'] as List<dynamic>?)?.map((e) => e as num).toList(),
  openFromHour: json['openFromHour'] as num?,
  openToHour: json['openToHour'] as num?,
  timeZone: json['timeZone'] as String?,
  autoReply: json['autoReply'] as bool?,
  autoCloseResolvedDays: json['autoCloseResolvedDays'] as num?,
);

Map<String, dynamic> _$UpdateSupportDeskSettingsDtoToJson(
  UpdateSupportDeskSettingsDto instance,
) => <String, dynamic>{
  'autoAssign': ?instance.autoAssign,
  'slaFirstResponseMinutes': ?instance.slaFirstResponseMinutes,
  'slaUrgentMinutes': ?instance.slaUrgentMinutes,
  'slaAlerts': ?instance.slaAlerts,
  'escalateOnBreach': ?instance.escalateOnBreach,
  'alwaysOpen': ?instance.alwaysOpen,
  'openDays': ?instance.openDays,
  'openFromHour': ?instance.openFromHour,
  'openToHour': ?instance.openToHour,
  'timeZone': ?instance.timeZone,
  'autoReply': ?instance.autoReply,
  'autoCloseResolvedDays': ?instance.autoCloseResolvedDays,
};
