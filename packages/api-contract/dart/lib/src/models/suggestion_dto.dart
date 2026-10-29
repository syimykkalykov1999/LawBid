// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'suggestion_dto_kind.dart';

part 'suggestion_dto.g.dart';

@JsonSerializable()
class SuggestionDto {
  const SuggestionDto({
    required this.kind,
    required this.text,
  });
  
  factory SuggestionDto.fromJson(Map<String, Object?> json) => _$SuggestionDtoFromJson(json);
  
  final SuggestionDtoKind kind;
  final String text;

  Map<String, Object?> toJson() => _$SuggestionDtoToJson(this);
}
