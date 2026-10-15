// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'app_event_in_dto.dart';

part 'app_event_batch_dto.g.dart';

@JsonSerializable()
class AppEventBatchDto {
  const AppEventBatchDto({required this.events});

  factory AppEventBatchDto.fromJson(Map<String, Object?> json) =>
      _$AppEventBatchDtoFromJson(json);

  final List<AppEventInDto> events;

  Map<String, Object?> toJson() => _$AppEventBatchDtoToJson(this);
}
