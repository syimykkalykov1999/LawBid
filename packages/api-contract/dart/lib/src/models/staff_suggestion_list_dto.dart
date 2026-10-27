// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_suggestion_dto.dart';

part 'staff_suggestion_list_dto.g.dart';

@JsonSerializable()
class StaffSuggestionListDto {
  const StaffSuggestionListDto({required this.items});

  factory StaffSuggestionListDto.fromJson(Map<String, Object?> json) =>
      _$StaffSuggestionListDtoFromJson(json);

  final List<StaffSuggestionDto> items;

  Map<String, Object?> toJson() => _$StaffSuggestionListDtoToJson(this);
}
