// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deadline_holiday_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeadlineHolidayDto _$DeadlineHolidayDtoFromJson(Map<String, dynamic> json) =>
    DeadlineHolidayDto(
      date: json['date'] as String,
      names: Map<String, String>.from(json['names'] as Map),
    );

Map<String, dynamic> _$DeadlineHolidayDtoToJson(DeadlineHolidayDto instance) =>
    <String, dynamic>{'date': instance.date, 'names': instance.names};
