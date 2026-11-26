// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_reel_watch_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordReelWatchDto _$RecordReelWatchDtoFromJson(Map<String, dynamic> json) =>
    RecordReelWatchDto(
      events: (json['events'] as List<dynamic>)
          .map((e) => ReelWatchItemDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$RecordReelWatchDtoToJson(RecordReelWatchDto instance) =>
    <String, dynamic>{
      'events': instance.events.map((e) => e.toJson()).toList(),
    };
