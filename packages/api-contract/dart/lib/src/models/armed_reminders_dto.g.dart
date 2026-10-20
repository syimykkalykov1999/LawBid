// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'armed_reminders_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ArmedRemindersDto _$ArmedRemindersDtoFromJson(Map<String, dynamic> json) =>
    ArmedRemindersDto(
      token: json['token'] as String,
      ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
    );

Map<String, dynamic> _$ArmedRemindersDtoToJson(ArmedRemindersDto instance) =>
    <String, dynamic>{'token': instance.token, 'ids': instance.ids};
