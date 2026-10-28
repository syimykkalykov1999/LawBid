// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'address_suggestion_dto.dart';

part 'address_suggestions_dto.g.dart';

@JsonSerializable()
class AddressSuggestionsDto {
  const AddressSuggestionsDto({required this.enabled, required this.items});

  factory AddressSuggestionsDto.fromJson(Map<String, Object?> json) =>
      _$AddressSuggestionsDtoFromJson(json);

  final bool enabled;
  final List<AddressSuggestionDto> items;

  Map<String, Object?> toJson() => _$AddressSuggestionsDtoToJson(this);
}
