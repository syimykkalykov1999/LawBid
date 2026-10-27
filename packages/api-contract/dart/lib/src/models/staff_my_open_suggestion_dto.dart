// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_my_open_suggestion_dto_kind.dart';

part 'staff_my_open_suggestion_dto.g.dart';

@JsonSerializable()
class StaffMyOpenSuggestionDto {
  const StaffMyOpenSuggestionDto({required this.kind});

  factory StaffMyOpenSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$StaffMyOpenSuggestionDtoFromJson(json);

  /// Only the soft ones are ever shown to the person themself.
  final StaffMyOpenSuggestionDtoKind kind;

  Map<String, Object?> toJson() => _$StaffMyOpenSuggestionDtoToJson(this);
}
