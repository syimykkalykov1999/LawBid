// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_event_batch_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppEventBatchDto _$AppEventBatchDtoFromJson(Map<String, dynamic> json) =>
    AppEventBatchDto(
      events: (json['events'] as List<dynamic>)
          .map((e) => AppEventInDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AppEventBatchDtoToJson(AppEventBatchDto instance) =>
    <String, dynamic>{
      'events': instance.events.map((e) => e.toJson()).toList(),
    };
