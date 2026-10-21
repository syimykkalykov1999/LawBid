// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationSettingsDto _$ConsultationSettingsDtoFromJson(
  Map<String, dynamic> json,
) => ConsultationSettingsDto(
  enabled: json['enabled'] as bool,
  slotMinutes: (json['slotMinutes'] as num).toInt(),
  bufferMinutes: (json['bufferMinutes'] as num).toInt(),
  minNoticeHours: (json['minNoticeHours'] as num).toInt(),
  horizonDays: (json['horizonDays'] as num).toInt(),
  autoConfirm: json['autoConfirm'] as bool,
  windows: (json['windows'] as List<dynamic>)
      .map((e) => ConsultationWindowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  timeOff: (json['timeOff'] as List<dynamic>)
      .map((e) => ConsultationTimeOffDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  bookable: json['bookable'] as bool,
  timezone: json['timezone'] as String?,
  notBookableReason: json['notBookableReason'] == null
      ? null
      : ConsultationSettingsDtoNotBookableReason.fromJson(
          json['notBookableReason'] as String,
        ),
);

Map<String, dynamic> _$ConsultationSettingsDtoToJson(
  ConsultationSettingsDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'slotMinutes': instance.slotMinutes,
  'bufferMinutes': instance.bufferMinutes,
  'minNoticeHours': instance.minNoticeHours,
  'horizonDays': instance.horizonDays,
  'autoConfirm': instance.autoConfirm,
  'timezone': ?instance.timezone,
  'windows': instance.windows.map((e) => e.toJson()).toList(),
  'timeOff': instance.timeOff.map((e) => e.toJson()).toList(),
  'bookable': instance.bookable,
  'notBookableReason': ?instance.notBookableReason?.toJson(),
};
