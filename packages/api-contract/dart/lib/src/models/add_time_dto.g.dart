// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_time_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddTimeDto _$AddTimeDtoFromJson(Map<String, dynamic> json) => AddTimeDto(
  workedOn: DateTime.parse(json['workedOn'] as String),
  minutes: json['minutes'] as num,
  note: json['note'] as String?,
);

Map<String, dynamic> _$AddTimeDtoToJson(AddTimeDto instance) =>
    <String, dynamic>{
      'workedOn': instance.workedOn.toIso8601String(),
      'minutes': instance.minutes,
      'note': ?instance.note,
    };
