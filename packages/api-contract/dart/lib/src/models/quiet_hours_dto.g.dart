// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'quiet_hours_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuietHoursDto _$QuietHoursDtoFromJson(Map<String, dynamic> json) =>
    QuietHoursDto(
      start: json['start'] as String?,
      end: json['end'] as String?,
      timezone: json['timezone'] as String?,
    );

Map<String, dynamic> _$QuietHoursDtoToJson(QuietHoursDto instance) =>
    <String, dynamic>{
      'start': ?instance.start,
      'end': ?instance.end,
      'timezone': ?instance.timezone,
    };
