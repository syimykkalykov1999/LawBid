// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reel_watch_item_dto.dart';

part 'record_reel_watch_dto.g.dart';

@JsonSerializable()
class RecordReelWatchDto {
  const RecordReelWatchDto({required this.events});

  factory RecordReelWatchDto.fromJson(Map<String, Object?> json) =>
      _$RecordReelWatchDtoFromJson(json);

  final List<ReelWatchItemDto> events;

  Map<String, Object?> toJson() => _$RecordReelWatchDtoToJson(this);
}
