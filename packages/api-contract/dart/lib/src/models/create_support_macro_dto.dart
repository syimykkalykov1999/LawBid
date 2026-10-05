// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_support_macro_dto_category.dart';

part 'create_support_macro_dto.g.dart';

@JsonSerializable()
class CreateSupportMacroDto {
  const CreateSupportMacroDto({
    required this.title,
    required this.body,
    this.active = true,
    this.category,
  });

  factory CreateSupportMacroDto.fromJson(Map<String, Object?> json) =>
      _$CreateSupportMacroDtoFromJson(json);

  final String title;
  final String body;
  final CreateSupportMacroDtoCategory? category;
  final bool active;

  Map<String, Object?> toJson() => _$CreateSupportMacroDtoToJson(this);
}
