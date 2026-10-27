// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_calendar_connection_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateCalendarConnectionDto _$UpdateCalendarConnectionDtoFromJson(
  Map<String, dynamic> json,
) => UpdateCalendarConnectionDto(
  readBusy: json['readBusy'] as bool?,
  writeEvents: json['writeEvents'] as bool?,
);

Map<String, dynamic> _$UpdateCalendarConnectionDtoToJson(
  UpdateCalendarConnectionDto instance,
) => <String, dynamic>{
  'readBusy': ?instance.readBusy,
  'writeEvents': ?instance.writeEvents,
};
