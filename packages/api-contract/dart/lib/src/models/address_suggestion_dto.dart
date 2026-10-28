// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'address_suggestion_dto.g.dart';

@JsonSerializable()
class AddressSuggestionDto {
  const AddressSuggestionDto({
    required this.label,
    required this.city,
    required this.stateCode,
  });

  factory AddressSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$AddressSuggestionDtoFromJson(json);

  /// The full text for the field, e.g. "12 Main St, Hays, KS 67601".
  final String label;
  final String? city;

  /// Two-letter US state code.
  final String? stateCode;

  Map<String, Object?> toJson() => _$AddressSuggestionDtoToJson(this);
}
