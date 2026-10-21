// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_time_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTimeDto _$UpdateTimeDtoFromJson(Map<String, dynamic> json) =>
    UpdateTimeDto(
      minutes: json['minutes'] as num?,
      workedOn: json['workedOn'] == null
          ? null
          : DateTime.parse(json['workedOn'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$UpdateTimeDtoToJson(UpdateTimeDto instance) =>
    <String, dynamic>{
      'minutes': ?instance.minutes,
      'workedOn': ?instance.workedOn?.toIso8601String(),
      'note': ?instance.note,
    };
