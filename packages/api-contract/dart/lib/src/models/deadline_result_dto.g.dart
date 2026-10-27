// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deadline_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeadlineResultDto _$DeadlineResultDtoFromJson(Map<String, dynamic> json) =>
    DeadlineResultDto(
      rule: DeadlineRuleDto.fromJson(json['rule'] as Map<String, dynamic>),
      eventDate: json['eventDate'] as String,
      dueDate: json['dueDate'] as String,
      rawDate: json['rawDate'] as String,
      rolled: json['rolled'] as bool,
      holidays: (json['holidays'] as List<dynamic>)
          .map((e) => DeadlineHolidayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      warnings: (json['warnings'] as List<dynamic>)
          .map((e) => DeadlineResultDtoWarnings.fromJson(e as String))
          .toList(),
      calendarLinks: CalendarLinksDto.fromJson(
        json['calendarLinks'] as Map<String, dynamic>,
      ),
    );

Map<String, dynamic> _$DeadlineResultDtoToJson(DeadlineResultDto instance) =>
    <String, dynamic>{
      'rule': instance.rule.toJson(),
      'eventDate': instance.eventDate,
      'dueDate': instance.dueDate,
      'rawDate': instance.rawDate,
      'rolled': instance.rolled,
      'holidays': instance.holidays.map((e) => e.toJson()).toList(),
      'warnings': instance.warnings.map((e) => e.toJson()).toList(),
      'calendarLinks': instance.calendarLinks.toJson(),
    };
