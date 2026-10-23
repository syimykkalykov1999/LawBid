// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'missed_events_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MissedEventsDto _$MissedEventsDtoFromJson(Map<String, dynamic> json) =>
    MissedEventsDto(
      seq: json['seq'] as num,
      events: (json['events'] as List<dynamic>)
          .map((e) => MissedEventDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      complete: json['complete'] as bool,
    );

Map<String, dynamic> _$MissedEventsDtoToJson(MissedEventsDto instance) =>
    <String, dynamic>{
      'seq': instance.seq,
      'events': instance.events.map((e) => e.toJson()).toList(),
      'complete': instance.complete,
    };
