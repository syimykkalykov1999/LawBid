// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'missed_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MissedEventDto _$MissedEventDtoFromJson(Map<String, dynamic> json) =>
    MissedEventDto(
      seq: json['seq'] as num,
      event: json['event'] as String,
      data: json['data'],
      truncated: json['truncated'] as bool?,
    );

Map<String, dynamic> _$MissedEventDtoToJson(MissedEventDto instance) =>
    <String, dynamic>{
      'seq': instance.seq,
      'event': instance.event,
      'data': ?instance.data,
      'truncated': ?instance.truncated,
    };
