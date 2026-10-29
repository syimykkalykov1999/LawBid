// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_event_item_dto.dart';

part 'record_post_events_dto.g.dart';

@JsonSerializable()
class RecordPostEventsDto {
  const RecordPostEventsDto({
    required this.events,
  });
  
  factory RecordPostEventsDto.fromJson(Map<String, Object?> json) => _$RecordPostEventsDtoFromJson(json);
  
  final List<PostEventItemDto> events;

  Map<String, Object?> toJson() => _$RecordPostEventsDtoToJson(this);
}
