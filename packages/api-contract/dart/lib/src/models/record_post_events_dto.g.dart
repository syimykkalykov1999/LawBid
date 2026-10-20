// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_post_events_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordPostEventsDto _$RecordPostEventsDtoFromJson(Map<String, dynamic> json) =>
    RecordPostEventsDto(
      events: (json['events'] as List<dynamic>)
          .map((e) => PostEventItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$RecordPostEventsDtoToJson(
  RecordPostEventsDto instance,
) => <String, dynamic>{
  'events': instance.events.map((e) => e.toJson()).toList(),
};
