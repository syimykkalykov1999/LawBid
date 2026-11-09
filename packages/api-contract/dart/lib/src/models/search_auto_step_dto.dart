// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'search_auto_step_dto.g.dart';

@JsonSerializable()
class SearchAutoStepDto {
  const SearchAutoStepDto({
    required this.at,
    required this.step,
    required this.reason,
  });

  factory SearchAutoStepDto.fromJson(Map<String, Object?> json) =>
      _$SearchAutoStepDtoFromJson(json);

  final String at;

  /// search:set_mode:shadow | search:start_reindex | search:swap | search:set_mode:engine | search:set_mode:postgres
  final String step;
  final String reason;

  Map<String, Object?> toJson() => _$SearchAutoStepDtoToJson(this);
}
