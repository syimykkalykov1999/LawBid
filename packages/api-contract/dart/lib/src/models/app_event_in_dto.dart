// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'app_event_in_dto.g.dart';

@JsonSerializable()
class AppEventInDto {
  const AppEventInDto({required this.name, this.screen});

  factory AppEventInDto.fromJson(Map<String, Object?> json) =>
      _$AppEventInDtoFromJson(json);

  final String name;

  /// Screen route.
  final String? screen;

  Map<String, Object?> toJson() => _$AppEventInDtoToJson(this);
}
