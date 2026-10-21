// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_holiday_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminHolidayDto _$AdminHolidayDtoFromJson(Map<String, dynamic> json) =>
    AdminHolidayDto(
      date: json['date'] as String,
      names: Map<String, String>.from(json['names'] as Map),
      id: json['id'] as String,
      jurisdiction: json['jurisdiction'] as String,
    );

Map<String, dynamic> _$AdminHolidayDtoToJson(AdminHolidayDto instance) =>
    <String, dynamic>{
      'date': instance.date,
      'names': instance.names,
      'id': instance.id,
      'jurisdiction': instance.jurisdiction,
    };
