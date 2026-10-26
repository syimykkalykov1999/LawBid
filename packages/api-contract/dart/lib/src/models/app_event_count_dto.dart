// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'app_event_count_dto.g.dart';

@JsonSerializable()
class AppEventCountDto {
  const AppEventCountDto({
    required this.name,
    required this.screen,
    required this.count,
  });

  factory AppEventCountDto.fromJson(Map<String, Object?> json) =>
      _$AppEventCountDtoFromJson(json);

  final String name;

  /// Empty when the event has no screen.
  final String screen;
  final num count;

  Map<String, Object?> toJson() => _$AppEventCountDtoToJson(this);
}
