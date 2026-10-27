// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_decide_suggestion_dto_action.dart';

part 'staff_decide_suggestion_dto.g.dart';

@JsonSerializable()
class StaffDecideSuggestionDto {
  const StaffDecideSuggestionDto({required this.action, this.note});

  factory StaffDecideSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$StaffDecideSuggestionDtoFromJson(json);

  /// apply = do it (needs a fresh 2FA code); dismiss = not now.
  final StaffDecideSuggestionDtoAction action;

  /// Why (kept in the journal).
  final String? note;

  Map<String, Object?> toJson() => _$StaffDecideSuggestionDtoToJson(this);
}
