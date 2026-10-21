// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_holiday_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateHolidayDto _$CreateHolidayDtoFromJson(Map<String, dynamic> json) =>
    CreateHolidayDto(
      jurisdiction: json['jurisdiction'] as String,
      date: json['date'] as String,
      names: Map<String, String>.from(json['names'] as Map),
    );

Map<String, dynamic> _$CreateHolidayDtoToJson(CreateHolidayDto instance) =>
    <String, dynamic>{
      'jurisdiction': instance.jurisdiction,
      'date': instance.date,
      'names': instance.names,
    };
