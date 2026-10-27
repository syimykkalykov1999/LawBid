// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_today_suggestion_dto.dart';

part 'staff_today_suggestions_dto.g.dart';

@JsonSerializable()
class StaffTodaySuggestionsDto {
  const StaffTodaySuggestionsDto({required this.open, required this.items});

  factory StaffTodaySuggestionsDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodaySuggestionsDtoFromJson(json);

  /// All open ones.
  final int open;

  /// The 5 most serious.
  final List<StaffTodaySuggestionDto> items;

  Map<String, Object?> toJson() => _$StaffTodaySuggestionsDtoToJson(this);
}
