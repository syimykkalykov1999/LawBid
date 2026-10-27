// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_suggestion_kind.dart';

part 'staff_open_suggestion_dto.g.dart';

@JsonSerializable()
class StaffOpenSuggestionDto {
  const StaffOpenSuggestionDto({
    required this.id,
    required this.kind,
    required this.createdAt,
  });

  factory StaffOpenSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$StaffOpenSuggestionDtoFromJson(json);

  final String id;
  final StaffSuggestionKind kind;
  final String createdAt;

  Map<String, Object?> toJson() => _$StaffOpenSuggestionDtoToJson(this);
}
