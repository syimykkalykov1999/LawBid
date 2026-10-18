// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_macro_dto_category.dart';

part 'support_macro_dto.g.dart';

@JsonSerializable()
class SupportMacroDto {
  const SupportMacroDto({
    required this.id,
    required this.title,
    required this.body,
    required this.text,
    required this.active,
    required this.uses,
    required this.updatedAt,
    this.bodyRu,
    this.category,
  });

  factory SupportMacroDto.fromJson(Map<String, Object?> json) =>
      _$SupportMacroDtoFromJson(json);

  final String id;
  final String title;

  /// English text. `{name}` becomes the user first name, `{ticket}` the ticket number (replaced by the API when the reply is sent).
  final String body;

  /// Russian text; the composer uses it for ru users.
  final String? bodyRu;

  /// The text to insert: the Russian body for `language=ru` (when there is one), else the English body.
  final String text;
  final SupportMacroDtoCategory? category;
  final bool active;
  final num uses;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$SupportMacroDtoToJson(this);
}
