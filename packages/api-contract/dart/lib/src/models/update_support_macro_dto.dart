// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_support_macro_dto_category.dart';

part 'update_support_macro_dto.g.dart';

@JsonSerializable()
class UpdateSupportMacroDto {
  const UpdateSupportMacroDto({
    this.title,
    this.body,
    this.bodyRu,
    this.category,
    this.active,
  });

  factory UpdateSupportMacroDto.fromJson(Map<String, Object?> json) =>
      _$UpdateSupportMacroDtoFromJson(json);

  final String? title;
  final String? body;

  /// null or empty removes the Russian text.
  final String? bodyRu;
  final UpdateSupportMacroDtoCategory? category;
  final bool? active;

  Map<String, Object?> toJson() => _$UpdateSupportMacroDtoToJson(this);
}
