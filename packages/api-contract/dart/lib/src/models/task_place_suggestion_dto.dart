// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'task_place_suggestion_dto.g.dart';

@JsonSerializable()
class TaskPlaceSuggestionDto {
  const TaskPlaceSuggestionDto({
    required this.address,
    required this.uses,
    this.label,
  });

  factory TaskPlaceSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$TaskPlaceSuggestionDtoFromJson(json);

  final String address;
  final String? label;
  final num uses;

  Map<String, Object?> toJson() => _$TaskPlaceSuggestionDtoToJson(this);
}
