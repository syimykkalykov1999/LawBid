// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'search_click_dto_target_type.dart';

part 'search_click_dto.g.dart';

@JsonSerializable()
class SearchClickDto {
  const SearchClickDto({
    required this.q,
    required this.targetType,
    required this.targetId,
  });

  factory SearchClickDto.fromJson(Map<String, Object?> json) =>
      _$SearchClickDtoFromJson(json);

  /// The text that was searched.
  final String q;
  final SearchClickDtoTargetType targetType;

  /// Id of the opened result (a code for a practice).
  final String targetId;

  Map<String, Object?> toJson() => _$SearchClickDtoToJson(this);
}
