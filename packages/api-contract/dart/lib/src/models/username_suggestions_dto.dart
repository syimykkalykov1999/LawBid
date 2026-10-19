// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'username_suggestions_dto.g.dart';

@JsonSerializable()
class UsernameSuggestionsDto {
  const UsernameSuggestionsDto({required this.suggestions});

  factory UsernameSuggestionsDto.fromJson(Map<String, Object?> json) =>
      _$UsernameSuggestionsDtoFromJson(json);

  final List<String> suggestions;

  Map<String, Object?> toJson() => _$UsernameSuggestionsDtoToJson(this);
}
